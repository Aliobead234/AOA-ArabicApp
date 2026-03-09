package main

import (
	"context"
	gocrypto "crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/skip2/go-qrcode"
)

const (
	statusPending              = "pending"
	statusAwaitingVerification = "awaiting_verification"
	statusConfirmed            = "confirmed"
	statusExpired              = "expired"
	statusRejected             = "rejected"
)

const (
	maxSupabaseAuthErrorBodyBytes = 4096
	supabaseAuthTimeout           = 8 * time.Second
)

var (
	errAuthTokenInvalid         = errors.New("auth token invalid")
	errAuthTokenExpired         = errors.New("auth token expired")
	errAuthServiceUnavailable   = errors.New("auth service unavailable")
	errAuthServiceMisconfigured = errors.New("auth service misconfigured")
	supabaseAuthHTTPClient      = &http.Client{Timeout: supabaseAuthTimeout}
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
  period TEXT NOT NULL CHECK (period IN ('one-time', 'monthly')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_verification', 'confirmed', 'expired', 'rejected')),
  verification_token TEXT NOT NULL,
  payment_comment TEXT NOT NULL UNIQUE,
  qr_payload TEXT NULL,
  qr_url TEXT NULL,
  qr_image_url TEXT NULL,
  provider_order_id TEXT NULL,
  provider_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL
);

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS qr_payload TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS qr_url TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS qr_image_url TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_order_id TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_status TEXT NULL;
ALTER TABLE payment_orders ALTER COLUMN period TYPE TEXT USING period::text;
ALTER TABLE payment_orders ALTER COLUMN status TYPE TEXT USING status::text;

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status, expires_at);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired')),
  order_id TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

type Plan struct {
	ID       string
	Name     string
	PriceRub int
	Period   string
}

var plans = map[string]Plan{
	"starter":  {ID: "starter", Name: "Starter", PriceRub: 299, Period: "one-time"},
	"pro":      {ID: "pro", Name: "Pro", PriceRub: 1, Period: "monthly"},
	"lifetime": {ID: "lifetime", Name: "Lifetime", PriceRub: 2999, Period: "one-time"},
}

type Config struct {
	Port                 string
	DatabaseURL          string
	SupabaseURL          string
	SupabaseAnonKey      string
	CorsAllowOrigins     []string
	OrderTTL             time.Duration
	MonthlyDurationDays  int
	AutoVerifyEnabled    bool
	AutoVerifyDelay      time.Duration
	AdminToken           string
	SBPRecipientPhone    string
	SBPRecipientBankName string
	SBPRecipientName     string
	SBPProviderMode      string
	SBPProviderCreateURL string
	SBPProviderAPIKey    string
	SBPWebhookSecret     string
	SBPProviderTimeout   time.Duration
	// Tochka Bank acquiring
	TochkaJWTToken      string
	TochkaClientID      string
	TochkaCustomerCode  string
	TochkaPaymentMode   string // "card", "sbp", "tinkoff"
	TochkaWebhookKeyURL string
	TochkaRedirectURL   string
}

type AuthUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

type CreateOrderRequest struct {
	PlanID string `json:"planId"`
}

type ConfirmOrderRequest struct {
	Token string `json:"token"`
}

type VerifyOrderRequest struct {
	Approved bool   `json:"approved"`
	Reason   string `json:"reason"`
}

type Recipient struct {
	Phone    string `json:"phone"`
	BankName string `json:"bankName"`
	Name     string `json:"name"`
}

type OrderResponse struct {
	OrderID         string    `json:"orderId"`
	Amount          int       `json:"amount"`
	Currency        string    `json:"currency"`
	PlanName        string    `json:"planName"`
	Period          string    `json:"period"`
	Status          string    `json:"status"`
	ExpiresAt       string    `json:"expiresAt"`
	PaymentComment  string    `json:"paymentComment"`
	Recipient       Recipient `json:"recipient"`
	QRPayload       string    `json:"qrPayload,omitempty"`
	QRURL           string    `json:"qrUrl,omitempty"`
	QRImageURL      string    `json:"qrImageUrl,omitempty"`
	ProviderOrderID string    `json:"providerOrderId,omitempty"`
	ProviderStatus  string    `json:"providerStatus,omitempty"`
	Token           string    `json:"token,omitempty"`
	CreatedAt       *string   `json:"createdAt,omitempty"`
	ConfirmedAt     *string   `json:"confirmedAt,omitempty"`
	VerifiedAt      *string   `json:"verifiedAt,omitempty"`
	RejectionReason *string   `json:"rejectionReason,omitempty"`
}

type dbOrder struct {
	OrderID         string
	UserID          string
	UserEmail       sql.NullString
	PlanID          string
	PlanName        string
	AmountRub       int
	Period          string
	Status          string
	VerificationTok string
	PaymentComment  string
	QRPayload       sql.NullString
	QRURL           sql.NullString
	QRImageURL      sql.NullString
	ProviderOrderID sql.NullString
	ProviderStatus  sql.NullString
	CreatedAt       time.Time
	ExpiresAt       time.Time
	ConfirmedAt     sql.NullTime
	VerifiedAt      sql.NullTime
	RejectionReason sql.NullString
}

type dbSubscription struct {
	UserID      string
	PlanID      string
	PlanName    string
	Status      string
	OrderID     string
	ActivatedAt time.Time
	ExpiresAt   sql.NullTime
}

type scanner interface {
	Scan(dest ...any) error
}

type sbpQRData struct {
	Payload         string
	URL             string
	ImageURL        string
	ProviderOrderID string
	ProviderStatus  string
}

const userContextKey = "auth_user"

// tochkaKeyCache caches Tochka's RS256 public key for 24 h to avoid
// fetching it on every webhook call.
var tochkaKeyCache struct {
	sync.RWMutex
	pem     []byte
	fetchAt time.Time
}

func main() {
	_ = godotenv.Load()

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	dbConnURL := cfg.DatabaseURL
	if strings.Contains(dbConnURL, "?") {
		dbConnURL += "&default_query_exec_mode=simple_protocol"
	} else {
		dbConnURL += "?default_query_exec_mode=simple_protocol"
	}
	db, err := sql.Open("pgx", dbConnURL)
	if err != nil {
		log.Fatalf("db open error: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("db ping error: %v", err)
	}

	if err := runMigrations(db); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CorsAllowOrigins,
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Admin-Token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "sbp-payment-go",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	router.POST("/api/v1/provider/webhook/sbp", providerWebhookHandler(db, cfg))

	// Tochka OAuth2 — browser-only, no auth middleware
	if cfg.SBPProviderMode == "tochka" {
		router.GET("/tochka/auth", tochkaAuthHandler(cfg))
		router.GET("/tochka/callback", tochkaCallbackHandler(cfg))
		router.POST("/tochka/exchange", tochkaExchangeHandler(cfg))
	}

	api := router.Group("/api/v1")
	api.Use(authMiddleware(cfg))
	{
		api.POST("/orders", createOrderHandler(db, cfg))
		api.GET("/orders/:id", getOrderHandler(db, cfg))
		api.POST("/orders/:id/confirm", confirmOrderHandler(db, cfg))
		api.GET("/subscription", getSubscriptionHandler(db))
	}

	if cfg.AdminToken != "" {
		admin := router.Group("/api/v1/admin")
		admin.Use(adminMiddleware(cfg.AdminToken))
		admin.POST("/orders/:id/verify", verifyOrderHandler(db, cfg))
	}

	log.Printf("SBP payment microservice listening on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func loadConfig() (Config, error) {
	port := envOrDefault("PORT", "8080")
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	supabaseURL := strings.TrimSpace(os.Getenv("SUPABASE_URL"))
	supabaseAnon := strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY"))

	if dbURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if supabaseURL == "" {
		return Config{}, errors.New("SUPABASE_URL is required")
	}
	if supabaseAnon == "" {
		return Config{}, errors.New("SUPABASE_ANON_KEY is required")
	}

	ttlMinutes := envIntOrDefault("ORDER_TTL_MINUTES", 30)
	if ttlMinutes < 5 {
		ttlMinutes = 5
	}

	monthlyDays := envIntOrDefault("MONTHLY_DURATION_DAYS", 30)
	if monthlyDays < 1 {
		monthlyDays = 30
	}

	delaySeconds := envIntOrDefault("AUTO_VERIFY_DELAY_SECONDS", 3)
	if delaySeconds < 1 {
		delaySeconds = 1
	}

	originsRaw := envOrDefault("CORS_ALLOW_ORIGINS", "*")
	origins := make([]string, 0, 4)
	for _, origin := range strings.Split(originsRaw, ",") {
		clean := strings.TrimSpace(origin)
		if clean != "" {
			origins = append(origins, clean)
		}
	}
	if len(origins) == 0 {
		origins = []string{"*"}
	}

	providerMode := strings.ToLower(envOrDefault("SBP_PROVIDER_MODE", "mock"))
	if providerMode != "mock" && providerMode != "http" && providerMode != "tochka" {
		return Config{}, errors.New("SBP_PROVIDER_MODE must be: mock, http, or tochka")
	}

	providerCreateURL := strings.TrimSpace(os.Getenv("SBP_PROVIDER_CREATE_URL"))
	providerAPIKey := strings.TrimSpace(os.Getenv("SBP_PROVIDER_API_KEY"))
	if providerMode == "http" {
		if providerCreateURL == "" {
			return Config{}, errors.New("SBP_PROVIDER_CREATE_URL is required when SBP_PROVIDER_MODE=http")
		}
		if providerAPIKey == "" {
			return Config{}, errors.New("SBP_PROVIDER_API_KEY is required when SBP_PROVIDER_MODE=http")
		}
	}

	tochkaJWT := strings.TrimSpace(os.Getenv("TOCHKA_JWT_TOKEN"))
	tochkaClientID := strings.TrimSpace(os.Getenv("TOCHKA_CLIENT_ID"))
	tochkaCode := strings.TrimSpace(os.Getenv("TOCHKA_CUSTOMER_CODE"))
	tochkaPayMode := envOrDefault("TOCHKA_PAYMENT_MODE", "card")
	tochkaKeyURL := envOrDefault("TOCHKA_WEBHOOK_KEY_URL", "https://enter.tochka.com/doc/openapi/static/keys/public")
	tochkaRedirectURL := envOrDefault("TOCHKA_REDIRECT_URL", "http://localhost:8081/tochka/callback")
	if providerMode == "tochka" {
		if tochkaJWT == "" {
			return Config{}, errors.New("TOCHKA_JWT_TOKEN is required when SBP_PROVIDER_MODE=tochka")
		}
		if tochkaClientID == "" {
			return Config{}, errors.New("TOCHKA_CLIENT_ID is required when SBP_PROVIDER_MODE=tochka")
		}
		if tochkaCode == "" {
			return Config{}, errors.New("TOCHKA_CUSTOMER_CODE is required when SBP_PROVIDER_MODE=tochka")
		}
	}

	providerTimeoutSeconds := envIntOrDefault("SBP_PROVIDER_TIMEOUT_SECONDS", 10)
	if providerTimeoutSeconds < 2 {
		providerTimeoutSeconds = 2
	}

	return Config{
		Port:                 port,
		DatabaseURL:          dbURL,
		SupabaseURL:          strings.TrimRight(supabaseURL, "/"),
		SupabaseAnonKey:      supabaseAnon,
		CorsAllowOrigins:     origins,
		OrderTTL:             time.Duration(ttlMinutes) * time.Minute,
		MonthlyDurationDays:  monthlyDays,
		AutoVerifyEnabled:    envBoolOrDefault("AUTO_VERIFY_ENABLED", false),
		AutoVerifyDelay:      time.Duration(delaySeconds) * time.Second,
		AdminToken:           strings.TrimSpace(os.Getenv("ADMIN_TOKEN")),
		SBPRecipientPhone:    envOrDefault("SBP_RECIPIENT_PHONE", "+79013622325"),
		SBPRecipientBankName: envOrDefault("SBP_RECIPIENT_BANK", "Tinkoff"),
		SBPRecipientName:     envOrDefault("SBP_RECIPIENT_NAME", "AOA Flashcards"),
		SBPProviderMode:      providerMode,
		SBPProviderCreateURL: providerCreateURL,
		SBPProviderAPIKey:    providerAPIKey,
		SBPWebhookSecret:     strings.TrimSpace(os.Getenv("SBP_WEBHOOK_SECRET")),
		SBPProviderTimeout:   time.Duration(providerTimeoutSeconds) * time.Second,
		TochkaJWTToken:       tochkaJWT,
		TochkaClientID:       tochkaClientID,
		TochkaCustomerCode:   tochkaCode,
		TochkaPaymentMode:    tochkaPayMode,
		TochkaWebhookKeyURL:  tochkaKeyURL,
		TochkaRedirectURL:    tochkaRedirectURL,
	}, nil
}

func runMigrations(db *sql.DB) error {
	_, err := db.Exec(schemaSQL)
	return err
}

func authMiddleware(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		accessToken := bearerToken(c.GetHeader("Authorization"))
		if accessToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			c.Abort()
			return
		}

		// Fast-fail obviously expired JWTs without network dependency.
		//if expiry, err := jwtExpiry(accessToken); err == nil && !expiry.After(time.Now().UTC()) {
		//	c.JSON(http.StatusUnauthorized, gin.H{"error": "auth token expired"})
		//	c.Abort()
		//	return
		//}

		user, err := fetchSupabaseUser(c.Request.Context(), cfg, accessToken)
		if err != nil {
			switch {
			case errors.Is(err, errAuthTokenExpired):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "auth token expired"})
			case errors.Is(err, errAuthTokenInvalid):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid auth token"})
			case errors.Is(err, errAuthServiceMisconfigured):
				log.Printf("auth middleware misconfigured: %v", err)
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "payment auth service misconfigured"})
			default:
				log.Printf("auth middleware unavailable: %v", err)
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "auth service unavailable"})
			}
			c.Abort()
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

func adminMiddleware(adminToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Admin-Token") != adminToken {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid admin token"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func fetchSupabaseUser(ctx context.Context, cfg Config, accessToken string) (*AuthUser, error) {
	ctx, cancel := context.WithTimeout(ctx, supabaseAuthTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		cfg.SupabaseURL+"/auth/v1/user",
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("apikey", cfg.SupabaseAnonKey)

	resp, err := supabaseAuthHTTPClient.Do(req)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return nil, fmt.Errorf("%w: timeout calling supabase auth", errAuthServiceUnavailable)
		}
		return nil, fmt.Errorf("%w: failed to call supabase auth: %v", errAuthServiceUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		payloadBytes, _ := io.ReadAll(io.LimitReader(resp.Body, maxSupabaseAuthErrorBodyBytes))
		payload := strings.ToLower(strings.TrimSpace(string(payloadBytes)))

		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			if looksLikeSupabaseConfigError(payload) {
				return nil, fmt.Errorf("%w: supabase auth rejected api key", errAuthServiceMisconfigured)
			}
			if strings.Contains(payload, "expired") {
				return nil, fmt.Errorf("%w: upstream reports expired token", errAuthTokenExpired)
			}
			return nil, fmt.Errorf("%w: supabase auth status %d", errAuthTokenInvalid, resp.StatusCode)
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("%w: supabase auth throttled", errAuthServiceUnavailable)
		default:
			if resp.StatusCode >= http.StatusInternalServerError {
				return nil, fmt.Errorf("%w: supabase auth status %d", errAuthServiceUnavailable, resp.StatusCode)
			}
			return nil, fmt.Errorf("%w: unexpected supabase auth status %d", errAuthServiceUnavailable, resp.StatusCode)
		}
	}

	var payload AuthUser
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: invalid auth payload: %v", errAuthServiceUnavailable, err)
	}
	if payload.ID == "" {
		return nil, fmt.Errorf("%w: missing user id from supabase", errAuthServiceUnavailable)
	}
	return &payload, nil
}

func looksLikeSupabaseConfigError(payload string) bool {
	return strings.Contains(payload, "apikey") ||
		strings.Contains(payload, "api key") ||
		strings.Contains(payload, "invalid key") ||
		strings.Contains(payload, "missing key")
}

func jwtExpiry(accessToken string) (time.Time, error) {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return time.Time{}, errors.New("invalid jwt format")
	}

	claimsRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, err
	}

	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(claimsRaw, &claims); err != nil {
		return time.Time{}, err
	}
	if claims.Exp <= 0 {
		return time.Time{}, errors.New("missing exp claim")
	}

	return time.Unix(claims.Exp, 0).UTC(), nil
}

func createOrderHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := mustUser(c)
		if !ok {
			return
		}

		var req CreateOrderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
			return
		}
		plan, exists := plans[req.PlanID]
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid planId"})
			return
		}

		ctx := c.Request.Context()
		var pendingCount int
		err := db.QueryRowContext(
			ctx,
			`SELECT COUNT(1)
			 FROM payment_orders
			 WHERE user_id = $1
			   AND plan_id = $2
			   AND verified_at IS NULL
			   AND expires_at > NOW()`,
			user.ID,
			plan.ID,
		).Scan(&pendingCount)
		if err != nil {
			log.Printf("failed to check pending orders: user=%s plan=%s err=%v", user.ID, plan.ID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check pending orders"})
			return
		}
		if pendingCount >= 3 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many pending orders"})
			return
		}

		orderID, err := generateOrderID()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate order id"})
			return
		}
		token, err := generateOrderToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate verification token"})
			return
		}

		now := time.Now().UTC()
		expiresAt := now.Add(cfg.OrderTTL)
		paymentComment := orderID
		qrData, err := createSBPQR(c.Request.Context(), cfg, orderID, plan, paymentComment, expiresAt)
		if err != nil {
			log.Printf("failed to create SBP QR for order %s: %v", orderID, err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to initialize SBP QR payment"})
			return
		}
		if qrData.ProviderStatus == "" {
			qrData.ProviderStatus = statusPending
		}

		_, err = db.ExecContext(
			ctx,
			`INSERT INTO payment_orders (
				order_id, user_id, user_email, plan_id, plan_name, amount_rub, period, status, verification_token,
				payment_comment, qr_payload, qr_url, qr_image_url, provider_order_id, provider_status, created_at, expires_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
			)`,
			orderID,
			user.ID,
			nullIfEmpty(user.Email),
			plan.ID,
			plan.Name,
			plan.PriceRub,
			plan.Period,
			statusPending,
			token,
			paymentComment,
			nullIfEmpty(qrData.Payload),
			nullIfEmpty(qrData.URL),
			nullIfEmpty(qrData.ImageURL),
			nullIfEmpty(qrData.ProviderOrderID),
			nullIfEmpty(qrData.ProviderStatus),
			now,
			expiresAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
			return
		}

		resp := OrderResponse{
			OrderID:        orderID,
			Amount:         plan.PriceRub,
			Currency:       "RUB",
			PlanName:       plan.Name,
			Period:         plan.Period,
			Status:         statusPending,
			ExpiresAt:      expiresAt.Format(time.RFC3339),
			PaymentComment: paymentComment,
			Recipient: Recipient{
				Phone:    cfg.SBPRecipientPhone,
				BankName: cfg.SBPRecipientBankName,
				Name:     cfg.SBPRecipientName,
			},
			QRPayload:       qrData.Payload,
			QRURL:           qrData.URL,
			QRImageURL:      qrData.ImageURL,
			ProviderOrderID: qrData.ProviderOrderID,
			ProviderStatus:  qrData.ProviderStatus,
			Token:           token,
		}
		c.JSON(http.StatusOK, resp)
	}
}

func getOrderHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := mustUser(c)
		if !ok {
			return
		}

		orderID := strings.TrimSpace(c.Param("id"))
		if orderID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing order id"})
			return
		}

		order, err := loadOrderByID(c.Request.Context(), db, orderID)
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read order"})
			return
		}
		if order.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}

		if order.Status == statusPending && time.Now().UTC().After(order.ExpiresAt) {
			order.Status = statusExpired
			if _, err := db.ExecContext(
				c.Request.Context(),
				`UPDATE payment_orders SET status = $2 WHERE order_id = $1`,
				order.OrderID,
				statusExpired,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update expired order"})
				return
			}
		}

		resp := toOrderResponse(order, cfg, false)
		c.JSON(http.StatusOK, resp)
	}
}

func confirmOrderHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := mustUser(c)
		if !ok {
			return
		}

		orderID := strings.TrimSpace(c.Param("id"))
		if orderID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing order id"})
			return
		}

		var req ConfirmOrderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
			return
		}
		if req.Token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
			return
		}

		tx, err := db.BeginTx(c.Request.Context(), &sql.TxOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback()

		order, err := loadOrderByIDForUpdate(c.Request.Context(), tx, orderID)
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read order"})
			return
		}
		if order.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if order.VerificationTok != req.Token {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid order token"})
			return
		}

		now := time.Now().UTC()
		if now.After(order.ExpiresAt) {
			if _, err := tx.ExecContext(
				c.Request.Context(),
				`UPDATE payment_orders SET status = $2 WHERE order_id = $1`,
				order.OrderID,
				statusExpired,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to expire order"})
				return
			}
			if err := tx.Commit(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize expired order"})
				return
			}
			c.JSON(http.StatusGone, gin.H{"error": "order has expired"})
			return
		}

		if order.Status == statusConfirmed {
			c.JSON(http.StatusOK, gin.H{
				"orderId": order.OrderID,
				"status":  statusConfirmed,
				"message": "payment already confirmed",
			})
			return
		}
		if order.Status == statusAwaitingVerification {
			c.JSON(http.StatusOK, gin.H{
				"orderId": order.OrderID,
				"status":  statusAwaitingVerification,
				"message": "payment already awaiting verification",
			})
			return
		}
		if order.Status != statusPending {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("order cannot be confirmed in status %q", order.Status)})
			return
		}

		if _, err := tx.ExecContext(
			c.Request.Context(),
			`UPDATE payment_orders
			 SET status = $2, confirmed_at = $3
			 WHERE order_id = $1`,
			order.OrderID,
			statusAwaitingVerification,
			now,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to confirm order"})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize order confirmation"})
			return
		}

		if cfg.AutoVerifyEnabled {
			go autoVerifyOrder(order.OrderID, cfg, db)
		}

		c.JSON(http.StatusOK, gin.H{
			"orderId": order.OrderID,
			"status":  statusAwaitingVerification,
			"message": "payment confirmation received, waiting for verification",
		})
	}
}

func providerWebhookHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook body"})
			return
		}

		payload := map[string]any{}

		if cfg.SBPProviderMode == "tochka" {
			// Tochka sends the entire webhook body as a RS256-signed JWT string.
			tokenStr := strings.TrimSpace(string(rawBody))
			pubKeyPEM, err := fetchTochkaPublicKey(cfg.TochkaWebhookKeyURL)
			if err != nil {
				log.Printf("tochka: failed to fetch public key: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch webhook key"})
				return
			}
			claims, err := verifyRS256JWT(tokenStr, pubKeyPEM)
			if err != nil {
				log.Printf("tochka: JWT verification failed: %v", err)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook JWT"})
				return
			}
			payload = claims
		} else {
			if !verifySBPWebhook(c, cfg, rawBody) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook signature"})
				return
			}
			if err := json.Unmarshal(rawBody, &payload); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook json"})
				return
			}
		}

		orderID := extractWebhookOrderID(payload)
		if orderID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing order id in webhook payload"})
			return
		}

		providerOrderID := extractWebhookProviderOrderID(payload)
		providerStatus := strings.TrimSpace(extractWebhookStatus(payload))
		normalizedStatus := normalizeProviderStatus(providerStatus)
		if normalizedStatus == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported webhook status"})
			return
		}

		if err := applyProviderOrderUpdate(
			c.Request.Context(),
			db,
			cfg,
			orderID,
			providerOrderID,
			providerStatus,
			normalizedStatus,
		); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
				return
			}
			log.Printf("provider webhook update failed for order %s: %v", orderID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply webhook update"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":      true,
			"orderId": orderID,
			"status":  normalizedStatus,
		})
	}
}

func createSBPQR(ctx context.Context, cfg Config, orderID string, plan Plan, paymentComment string, expiresAt time.Time) (sbpQRData, error) {
	switch cfg.SBPProviderMode {
	case "tochka":
		return createTochkaPaymentLink(ctx, cfg, orderID, plan)
	case "http":
		return createSBPQRViaProviderHTTP(ctx, cfg, orderID, plan, paymentComment, expiresAt)
	default:
		return createSBPQRMock(cfg, orderID, plan, paymentComment)
	}
}

func createSBPQRMock(cfg Config, orderID string, plan Plan, paymentComment string) (sbpQRData, error) {
	values := url.Values{}
	values.Set("phone", cfg.SBPRecipientPhone)
	values.Set("amount", strconv.Itoa(plan.PriceRub*100))
	values.Set("currency", "RUB")
	values.Set("bank", cfg.SBPRecipientBankName)
	values.Set("recipient", cfg.SBPRecipientName)
	values.Set("comment", paymentComment)
	values.Set("orderId", orderID)
	values.Set("planId", plan.ID)

	payload := "sbp://pay?" + values.Encode()
	imageURL, err := generateQRDataURL(payload)
	if err != nil {
		return sbpQRData{}, err
	}

	return sbpQRData{
		Payload:        payload,
		URL:            payload,
		ImageURL:       imageURL,
		ProviderStatus: statusPending,
	}, nil
}

// ── Tochka Bank acquiring ─────────────────────────────────────────────────────

// createTochkaPaymentLink calls POST /acquiring/v1.0/payments and returns a
// clickable/scannable payment URL that accepts card, SBP, and T-Pay.
func createTochkaPaymentLink(ctx context.Context, cfg Config, orderID string, plan Plan) (sbpQRData, error) {
	accessToken, err := getTochkaAccessToken(cfg)
	if err != nil {
		return sbpQRData{}, fmt.Errorf("tochka token: %w", err)
	}

	// Embed orderID in "purpose" — Tochka echoes it back in the webhook payload.
	body := map[string]any{
		"Data": map[string]any{
			"customerCode": cfg.TochkaCustomerCode,
			"amount":       float64(plan.PriceRub),
			"purpose":      orderID,
			"paymentMode":  []string{cfg.TochkaPaymentMode},
		},
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return sbpQRData{}, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, cfg.SBPProviderTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(
		reqCtx, http.MethodPost,
		"https://enter.tochka.com/uapi/acquiring/v1.0/payments",
		strings.NewReader(string(bodyBytes)),
	)
	if err != nil {
		return sbpQRData{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: cfg.SBPProviderTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return sbpQRData{}, fmt.Errorf("tochka api request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return sbpQRData{}, fmt.Errorf("tochka create error: status=%d body=%s",
			resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var result struct {
		Data struct {
			OperationID string `json:"operationId"`
			PaymentURL  string `json:"paymentUrl"`
			Status      string `json:"status"`
		} `json:"Data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return sbpQRData{}, fmt.Errorf("tochka response parse error: %w", err)
	}
	if result.Data.PaymentURL == "" {
		return sbpQRData{}, errors.New("tochka did not return a paymentUrl")
	}

	// Generate a QR code so users can scan on mobile; link is also clickable.
	imageURL, _ := generateQRDataURL(result.Data.PaymentURL)

	return sbpQRData{
		Payload:         result.Data.PaymentURL,
		URL:             result.Data.PaymentURL,
		ImageURL:        imageURL,
		ProviderOrderID: result.Data.OperationID,
		ProviderStatus:  result.Data.Status,
	}, nil
}

// fetchTochkaPublicKey downloads Tochka's RS256 public key and caches it for
// 24 hours. Thread-safe.
func fetchTochkaPublicKey(keyURL string) ([]byte, error) {
	tochkaKeyCache.RLock()
	if len(tochkaKeyCache.pem) > 0 && time.Since(tochkaKeyCache.fetchAt) < 24*time.Hour {
		cached := tochkaKeyCache.pem
		tochkaKeyCache.RUnlock()
		return cached, nil
	}
	tochkaKeyCache.RUnlock()

	tochkaKeyCache.Lock()
	defer tochkaKeyCache.Unlock()

	// Re-check under write lock (double-checked locking).
	if len(tochkaKeyCache.pem) > 0 && time.Since(tochkaKeyCache.fetchAt) < 24*time.Hour {
		return tochkaKeyCache.pem, nil
	}

	resp, err := http.Get(keyURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch tochka public key: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tochka public key fetch returned status %d", resp.StatusCode)
	}

	pemBytes, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return nil, fmt.Errorf("failed to read tochka public key body: %w", err)
	}

	tochkaKeyCache.pem = pemBytes
	tochkaKeyCache.fetchAt = time.Now()
	return pemBytes, nil
}

// verifyRS256JWT verifies a JWT signed with RS256 using the provided PEM public
// key and returns the decoded claims. Uses only Go standard library — no external
// JWT package required.
func verifyRS256JWT(tokenString string, publicKeyPEM []byte) (map[string]any, error) {
	parts := strings.Split(strings.TrimSpace(tokenString), ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid JWT: expected header.payload.signature")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid JWT header encoding: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("invalid JWT header JSON: %w", err)
	}
	if !strings.EqualFold(header.Alg, "RS256") {
		return nil, fmt.Errorf("unexpected JWT algorithm %q (expected RS256)", header.Alg)
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid JWT payload encoding: %w", err)
	}

	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid JWT signature encoding: %w", err)
	}

	block, _ := pem.Decode(publicKeyPEM)
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public key: %w", err)
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not RSA")
	}

	signingInput := []byte(parts[0] + "." + parts[1])
	digest := sha256.Sum256(signingInput)
	if err := rsa.VerifyPKCS1v15(rsaPub, gocrypto.SHA256, digest[:], sigBytes); err != nil {
		return nil, fmt.Errorf("JWT signature invalid: %w", err)
	}

	var claims map[string]any
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid JWT payload JSON: %w", err)
	}
	return claims, nil
}

// ── Tochka OAuth2 ─────────────────────────────────────────────────────────────

const (
	tochkaAuthURL     = "https://enter.tochka.com/uapi/oauth2/v2.0/authorize"
	tochkaTokenURL    = "https://enter.tochka.com/uapi/oauth2/v2.0/token"
	tochkaOAuthScopes = "openid"
	tochkaTokenFile   = ".tochka_token.json"
)

type tochkaOAuthToken struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

var tochkaOAuth struct {
	sync.RWMutex
	token  *tochkaOAuthToken
	states map[string]time.Time // state → expiry
}

func init() {
	tochkaOAuth.states = make(map[string]time.Time)
	if data, err := os.ReadFile(tochkaTokenFile); err == nil {
		var t tochkaOAuthToken
		if json.Unmarshal(data, &t) == nil && t.AccessToken != "" {
			tochkaOAuth.token = &t
			log.Printf("tochka: loaded saved OAuth2 token (expires %s)", t.ExpiresAt.Format(time.RFC3339))
		}
	}
}

func saveTochkaOAuthToken(t *tochkaOAuthToken) {
	tochkaOAuth.Lock()
	tochkaOAuth.token = t
	tochkaOAuth.Unlock()
	if data, err := json.MarshalIndent(t, "", "  "); err == nil {
		_ = os.WriteFile(tochkaTokenFile, data, 0600)
	}
}

func getTochkaAccessToken(cfg Config) (string, error) {
	tochkaOAuth.RLock()
	tok := tochkaOAuth.token
	tochkaOAuth.RUnlock()

	if tok == nil {
		return "", errors.New("no Tochka OAuth2 token — open http://localhost:8081/tochka/auth in your browser to authorize")
	}
	// Valid with 60s buffer
	if time.Now().UTC().Add(60 * time.Second).Before(tok.ExpiresAt) {
		return tok.AccessToken, nil
	}
	// Try refresh
	if tok.RefreshToken != "" {
		newTok, err := exchangeTochkaToken(cfg, url.Values{
			"grant_type":    {"refresh_token"},
			"refresh_token": {tok.RefreshToken},
			"client_id":     {cfg.TochkaClientID},
			"client_secret": {cfg.TochkaJWTToken},
		})
		if err == nil {
			saveTochkaOAuthToken(newTok)
			return newTok.AccessToken, nil
		}
		log.Printf("tochka: token refresh failed: %v", err)
	}
	return "", errors.New("Tochka OAuth2 token expired — open http://localhost:8081/tochka/auth to re-authorize")
}

func exchangeTochkaToken(cfg Config, vals url.Values) (*tochkaOAuthToken, error) {
	req, err := http.NewRequest(http.MethodPost, tochkaTokenURL, strings.NewReader(vals.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Bearer "+cfg.TochkaJWTToken)

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("token parse error: %w", err)
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("empty access_token: %s", string(body))
	}
	expiresIn := result.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	return &tochkaOAuthToken{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    time.Now().UTC().Add(time.Duration(expiresIn) * time.Second),
	}, nil
}

// tochkaAuthHandler gets a client_credentials token then redirects the browser
// to Tochka's OAuth2 consent page with that token in the URL.
func tochkaAuthHandler(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Step 1: get a short-lived access token via client_credentials
		clientTok, err := exchangeTochkaToken(cfg, url.Values{
			"grant_type": {"client_credentials"},
			"client_id":  {cfg.TochkaClientID},
			"scope":      {tochkaOAuthScopes},
		})
		if err != nil {
			log.Printf("tochka auth: client_credentials failed: %v", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to get client token", "detail": err.Error()})
			return
		}

		// Step 2: generate CSRF state
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate state"})
			return
		}
		state := hex.EncodeToString(b)

		tochkaOAuth.Lock()
		now := time.Now()
		for s, exp := range tochkaOAuth.states {
			if now.After(exp) {
				delete(tochkaOAuth.states, s)
			}
		}
		tochkaOAuth.states[state] = now.Add(10 * time.Minute)
		tochkaOAuth.Unlock()

		// Step 3: redirect to consent page with fresh access_token
		params := url.Values{
			"response_type": {"code"},
			"client_id":     {cfg.TochkaClientID},
			"redirect_uri":  {cfg.TochkaRedirectURL},
			"scope":         {tochkaOAuthScopes},
			"state":         {state},
			"access_token":  {clientTok.AccessToken},
		}
		c.Redirect(http.StatusFound, tochkaAuthURL+"?"+params.Encode())
	}
}

// tochkaCallbackHandler receives the OAuth2 code from Tochka and exchanges it for a token.
func tochkaCallbackHandler(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if errParam := c.Query("error"); errParam != "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":       "tochka denied: " + errParam,
				"description": c.Query("error_description"),
			})
			return
		}

		code := c.Query("code")
		state := c.Query("state")
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
			return
		}

		tochkaOAuth.Lock()
		exp, ok := tochkaOAuth.states[state]
		if ok {
			delete(tochkaOAuth.states, state)
		}
		tochkaOAuth.Unlock()

		if !ok || time.Now().After(exp) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired state"})
			return
		}

		tok, err := exchangeTochkaToken(cfg, url.Values{
			"grant_type":    {"authorization_code"},
			"code":          {code},
			"redirect_uri":  {cfg.TochkaRedirectURL},
			"client_id":     {cfg.TochkaClientID},
			"client_secret": {cfg.TochkaJWTToken},
		})
		if err != nil {
			log.Printf("tochka: token exchange failed: %v", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "token exchange failed", "detail": err.Error()})
			return
		}

		saveTochkaOAuthToken(tok)
		log.Printf("tochka: OAuth2 token saved, expires %s", tok.ExpiresAt.Format(time.RFC3339))
		c.JSON(http.StatusOK, gin.H{
			"status":     "authorized",
			"expires_at": tok.ExpiresAt.Format(time.RFC3339),
			"message":    "Tochka acquiring access granted. You can close this tab.",
		})
	}
}

// tochkaExchangeHandler is called by the Vercel frontend after Tochka redirects
// to https://aoa-arabic-app.vercel.app/tochka/callback. The frontend posts the
// code + state here so the backend can complete the token exchange.
func tochkaExchangeHandler(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Code  string `json:"code"`
			State string `json:"state"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Code == "" || req.State == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code and state are required"})
			return
		}

		tochkaOAuth.Lock()
		exp, ok := tochkaOAuth.states[req.State]
		if ok {
			delete(tochkaOAuth.states, req.State)
		}
		tochkaOAuth.Unlock()

		if !ok || time.Now().After(exp) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired state"})
			return
		}

		tok, err := exchangeTochkaToken(cfg, url.Values{
			"grant_type":   {"authorization_code"},
			"code":         {req.Code},
			"redirect_uri": {cfg.TochkaRedirectURL},
			"client_id":    {cfg.TochkaClientID},
			"client_secret": {cfg.TochkaJWTToken},
		})
		if err != nil {
			log.Printf("tochka: exchange failed: %v", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "token exchange failed", "detail": err.Error()})
			return
		}

		saveTochkaOAuthToken(tok)
		log.Printf("tochka: OAuth2 token saved via frontend callback, expires %s", tok.ExpiresAt.Format(time.RFC3339))
		c.JSON(http.StatusOK, gin.H{
			"status":     "authorized",
			"expires_at": tok.ExpiresAt.Format(time.RFC3339),
			"message":    "Tochka acquiring access granted.",
		})
	}
}

// ── end Tochka Bank ───────────────────────────────────────────────────────────

func createSBPQRViaProviderHTTP(ctx context.Context, cfg Config, orderID string, plan Plan, paymentComment string, expiresAt time.Time) (sbpQRData, error) {
	payload := map[string]any{
		"orderId":     orderID,
		"amount":      plan.PriceRub,
		"currency":    "RUB",
		"description": fmt.Sprintf("%s (%s)", plan.Name, orderID),
		"comment":     paymentComment,
		"expiresAt":   expiresAt.UTC().Format(time.RFC3339),
		"metadata": map[string]any{
			"orderId":        orderID,
			"paymentComment": paymentComment,
			"planId":         plan.ID,
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return sbpQRData{}, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, cfg.SBPProviderTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, cfg.SBPProviderCreateURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return sbpQRData{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.SBPProviderAPIKey)

	client := &http.Client{Timeout: cfg.SBPProviderTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return sbpQRData{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return sbpQRData{}, fmt.Errorf("provider create error: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	responseData := map[string]any{}
	if err := json.Unmarshal(respBody, &responseData); err != nil {
		return sbpQRData{}, fmt.Errorf("provider response parse error: %w", err)
	}

	qrPayload := firstNonEmpty(
		stringFromMap(responseData, "qrPayload"),
		stringFromMap(responseData, "qr_payload"),
		stringFromMap(responseData, "payload"),
		stringFromMap(responseData, "qrData"),
	)
	qrURL := firstNonEmpty(
		stringFromMap(responseData, "qrUrl"),
		stringFromMap(responseData, "qr_url"),
		stringFromMap(responseData, "paymentUrl"),
		stringFromMap(responseData, "payment_url"),
		stringFromMap(responseData, "payUrl"),
		stringFromMap(responseData, "pay_url"),
	)
	qrImageURL := firstNonEmpty(
		stringFromMap(responseData, "qrImageUrl"),
		stringFromMap(responseData, "qr_image_url"),
		stringFromMap(responseData, "qrImage"),
		stringFromMap(responseData, "imageUrl"),
		stringFromMap(responseData, "image_url"),
	)
	providerOrderID := firstNonEmpty(
		stringFromMap(responseData, "paymentId"),
		stringFromMap(responseData, "payment_id"),
		stringFromMap(responseData, "providerOrderId"),
		stringFromMap(responseData, "provider_order_id"),
		stringFromMap(responseData, "id"),
	)
	providerStatus := firstNonEmpty(
		stringFromMap(responseData, "status"),
		stringFromMap(responseData, "state"),
	)

	if qrPayload == "" && qrURL == "" {
		return sbpQRData{}, errors.New("provider did not return qr payload or qr url")
	}
	if qrPayload == "" {
		qrPayload = qrURL
	}
	if qrURL == "" {
		qrURL = qrPayload
	}
	if qrImageURL == "" {
		generated, err := generateQRDataURL(qrPayload)
		if err != nil {
			return sbpQRData{}, err
		}
		qrImageURL = generated
	}

	return sbpQRData{
		Payload:         qrPayload,
		URL:             qrURL,
		ImageURL:        qrImageURL,
		ProviderOrderID: providerOrderID,
		ProviderStatus:  providerStatus,
	}, nil
}

func generateQRDataURL(payload string) (string, error) {
	pngData, err := qrcode.Encode(payload, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngData), nil
}

func verifySBPWebhook(c *gin.Context, cfg Config, body []byte) bool {
	secret := strings.TrimSpace(cfg.SBPWebhookSecret)
	if secret == "" {
		return true
	}

	signed := strings.TrimSpace(c.GetHeader("X-SBP-Signature"))
	if signed != "" {
		signed = strings.TrimPrefix(strings.ToLower(signed), "sha256=")
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))
		return hmac.Equal([]byte(signed), []byte(expected))
	}

	plainSecret := strings.TrimSpace(c.GetHeader("X-Webhook-Secret"))
	return hmac.Equal([]byte(plainSecret), []byte(secret))
}

func applyProviderOrderUpdate(
	ctx context.Context,
	db *sql.DB,
	cfg Config,
	orderID string,
	providerOrderID string,
	providerStatus string,
	normalizedStatus string,
) error {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback()

	order, err := loadOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}

	currentProviderStatus := strings.TrimSpace(providerStatus)
	if currentProviderStatus == "" {
		currentProviderStatus = normalizedStatus
	}

	now := time.Now().UTC()
	switch normalizedStatus {
	case statusConfirmed:
		if order.Status != statusConfirmed {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET status = $2,
				     verified_at = $3,
				     rejection_reason = NULL,
				     provider_order_id = COALESCE(NULLIF($4, ''), provider_order_id),
				     provider_status = $5
				 WHERE order_id = $1`,
				order.OrderID,
				statusConfirmed,
				now,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
			order.Status = statusConfirmed
			order.VerifiedAt = sql.NullTime{Time: now, Valid: true}
			if err := activateSubscription(ctx, tx, order, cfg); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET provider_order_id = COALESCE(NULLIF($2, ''), provider_order_id),
				     provider_status = $3
				 WHERE order_id = $1`,
				order.OrderID,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
		}
	case statusRejected:
		if order.Status != statusConfirmed {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET status = $2,
				     verified_at = $3,
				     rejection_reason = COALESCE(rejection_reason, 'provider rejected payment'),
				     provider_order_id = COALESCE(NULLIF($4, ''), provider_order_id),
				     provider_status = $5
				 WHERE order_id = $1`,
				order.OrderID,
				statusRejected,
				now,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET provider_order_id = COALESCE(NULLIF($2, ''), provider_order_id),
				     provider_status = $3
				 WHERE order_id = $1`,
				order.OrderID,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
		}
	case statusAwaitingVerification:
		if order.Status == statusPending {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET status = $2,
				     confirmed_at = COALESCE(confirmed_at, $3),
				     provider_order_id = COALESCE(NULLIF($4, ''), provider_order_id),
				     provider_status = $5
				 WHERE order_id = $1`,
				order.OrderID,
				statusAwaitingVerification,
				now,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE payment_orders
				 SET provider_order_id = COALESCE(NULLIF($2, ''), provider_order_id),
				     provider_status = $3
				 WHERE order_id = $1`,
				order.OrderID,
				providerOrderID,
				currentProviderStatus,
			); err != nil {
				return err
			}
		}
	default:
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE payment_orders
			 SET provider_order_id = COALESCE(NULLIF($2, ''), provider_order_id),
			     provider_status = $3
			 WHERE order_id = $1`,
			order.OrderID,
			providerOrderID,
			currentProviderStatus,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func extractWebhookOrderID(payload map[string]any) string {
	if orderID := firstNonEmpty(
		stringFromMap(payload, "orderId"),
		stringFromMap(payload, "order_id"),
		stringFromMap(payload, "merchantOrderId"),
		stringFromMap(payload, "merchant_order_id"),
		stringFromMap(payload, "invoiceId"),
		stringFromMap(payload, "invoice_id"),
		stringFromMap(payload, "purpose"), // Tochka Bank: orderID is embedded in purpose
	); orderID != "" {
		return orderID
	}

	metadata := mapFromMap(payload, "metadata")
	if metadata == nil {
		metadata = mapFromMap(payload, "meta")
	}
	if metadata != nil {
		return firstNonEmpty(
			stringFromMap(metadata, "orderId"),
			stringFromMap(metadata, "order_id"),
			stringFromMap(metadata, "paymentComment"),
			stringFromMap(metadata, "payment_comment"),
		)
	}

	return ""
}

func extractWebhookProviderOrderID(payload map[string]any) string {
	return firstNonEmpty(
		stringFromMap(payload, "paymentId"),
		stringFromMap(payload, "payment_id"),
		stringFromMap(payload, "providerOrderId"),
		stringFromMap(payload, "provider_order_id"),
		stringFromMap(payload, "id"),
	)
}

func extractWebhookStatus(payload map[string]any) string {
	return firstNonEmpty(
		stringFromMap(payload, "status"),
		stringFromMap(payload, "state"),
		stringFromMap(payload, "event"),
	)
}

func normalizeProviderStatus(raw string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "paid", "succeeded", "success", "confirmed", "completed",
		"approved": // Tochka Bank: final successful payment
		return statusConfirmed
	case "awaiting_verification", "processing", "pending", "waiting",
		"authorized": // Tochka Bank: pre-authorized, awaiting capture
		return statusAwaitingVerification
	case "failed", "rejected", "declined", "canceled", "cancelled",
		"refunded": // Tochka Bank: rejected or refunded
		return statusRejected
	default:
		return ""
	}
}

func mapFromMap(data map[string]any, key string) map[string]any {
	raw, ok := data[key]
	if !ok {
		return nil
	}
	m, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	return m
}

func stringFromMap(data map[string]any, key string) string {
	raw, ok := data[key]
	if !ok || raw == nil {
		return ""
	}

	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	case fmt.Stringer:
		return strings.TrimSpace(v.String())
	case float64:
		return strings.TrimSpace(strconv.FormatInt(int64(v), 10))
	case int:
		return strings.TrimSpace(strconv.Itoa(v))
	case int64:
		return strings.TrimSpace(strconv.FormatInt(v, 10))
	case json.Number:
		return strings.TrimSpace(v.String())
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean != "" {
			return clean
		}
	}
	return ""
}

func verifyOrderHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		orderID := strings.TrimSpace(c.Param("id"))
		if orderID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing order id"})
			return
		}

		var req VerifyOrderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
			return
		}

		tx, err := db.BeginTx(c.Request.Context(), &sql.TxOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback()

		order, err := loadOrderByIDForUpdate(c.Request.Context(), tx, orderID)
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read order"})
			return
		}

		if order.Status != statusAwaitingVerification && order.Status != statusPending {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("order in status %q cannot be verified", order.Status)})
			return
		}

		now := time.Now().UTC()
		if req.Approved {
			if _, err := tx.ExecContext(
				c.Request.Context(),
				`UPDATE payment_orders
				 SET status = $2, verified_at = $3, rejection_reason = NULL
				 WHERE order_id = $1`,
				order.OrderID,
				statusConfirmed,
				now,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to confirm order"})
				return
			}
			order.Status = statusConfirmed
			order.VerifiedAt = sql.NullTime{Time: now, Valid: true}
			order.RejectionReason = sql.NullString{}

			if err := activateSubscription(c.Request.Context(), tx, order, cfg); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate subscription"})
				return
			}
		} else {
			reason := strings.TrimSpace(req.Reason)
			if reason == "" {
				reason = "payment not found in bank statement"
			}
			if _, err := tx.ExecContext(
				c.Request.Context(),
				`UPDATE payment_orders
				 SET status = $2, verified_at = $3, rejection_reason = $4
				 WHERE order_id = $1`,
				order.OrderID,
				statusRejected,
				now,
				reason,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reject order"})
				return
			}
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize verification"})
			return
		}

		status := statusRejected
		if req.Approved {
			status = statusConfirmed
		}

		c.JSON(http.StatusOK, gin.H{
			"orderId": order.OrderID,
			"status":  status,
		})
	}
}

func getSubscriptionHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := mustUser(c)
		if !ok {
			return
		}

		sub, err := loadSubscription(c.Request.Context(), db, user.ID)
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusOK, gin.H{"subscription": nil})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read subscription"})
			return
		}

		now := time.Now().UTC()
		if sub.Status == "active" && sub.ExpiresAt.Valid && now.After(sub.ExpiresAt.Time) {
			_, _ = db.ExecContext(
				c.Request.Context(),
				`UPDATE user_subscriptions
				 SET status = 'expired', updated_at = NOW()
				 WHERE user_id = $1`,
				user.ID,
			)
			sub.Status = "expired"
		}

		resp := gin.H{
			"userId":      sub.UserID,
			"planId":      sub.PlanID,
			"planName":    sub.PlanName,
			"status":      sub.Status,
			"orderId":     sub.OrderID,
			"activatedAt": sub.ActivatedAt.UTC().Format(time.RFC3339),
			"expiresAt":   nullTimeToAny(sub.ExpiresAt),
		}
		c.JSON(http.StatusOK, gin.H{"subscription": resp})
	}
}

func autoVerifyOrder(orderID string, cfg Config, db *sql.DB) {
	time.Sleep(cfg.AutoVerifyDelay)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		log.Printf("auto verify: begin tx failed for %s: %v", orderID, err)
		return
	}
	defer tx.Rollback()

	order, err := loadOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		log.Printf("auto verify: load order failed for %s: %v", orderID, err)
		return
	}

	if order.Status != statusAwaitingVerification {
		if err := tx.Commit(); err != nil {
			log.Printf("auto verify: commit failed for %s: %v", orderID, err)
		}
		return
	}

	now := time.Now().UTC()
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE payment_orders
		 SET status = $2, verified_at = $3, rejection_reason = NULL
		 WHERE order_id = $1`,
		order.OrderID,
		statusConfirmed,
		now,
	); err != nil {
		log.Printf("auto verify: update failed for %s: %v", orderID, err)
		return
	}

	order.Status = statusConfirmed
	order.VerifiedAt = sql.NullTime{Time: now, Valid: true}
	order.RejectionReason = sql.NullString{}

	if err := activateSubscription(ctx, tx, order, cfg); err != nil {
		log.Printf("auto verify: activate sub failed for %s: %v", orderID, err)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("auto verify: commit failed for %s: %v", orderID, err)
		return
	}
}

func activateSubscription(ctx context.Context, tx *sql.Tx, order *dbOrder, cfg Config) error {
	activatedAt := time.Now().UTC()
	var expiresAt any
	if order.Period == "monthly" {
		expiresAt = activatedAt.Add(time.Duration(cfg.MonthlyDurationDays) * 24 * time.Hour)
	}

	_, err := tx.ExecContext(
		ctx,
		`INSERT INTO user_subscriptions (
			user_id, plan_id, plan_name, status, order_id, activated_at, expires_at, updated_at
		) VALUES (
			$1, $2, $3, 'active', $4, $5, $6, NOW()
		)
		ON CONFLICT (user_id) DO UPDATE
		SET plan_id = EXCLUDED.plan_id,
		    plan_name = EXCLUDED.plan_name,
		    status = EXCLUDED.status,
		    order_id = EXCLUDED.order_id,
		    activated_at = EXCLUDED.activated_at,
		    expires_at = EXCLUDED.expires_at,
		    updated_at = NOW()`,
		order.UserID,
		order.PlanID,
		order.PlanName,
		order.OrderID,
		activatedAt,
		expiresAt,
	)
	return err
}

func loadOrderByID(ctx context.Context, db *sql.DB, orderID string) (*dbOrder, error) {
	row := db.QueryRowContext(
		ctx,
		`SELECT order_id, user_id, user_email, plan_id, plan_name, amount_rub, period, status, verification_token,
		        payment_comment, qr_payload, qr_url, qr_image_url, provider_order_id, provider_status,
		        created_at, expires_at, confirmed_at, verified_at, rejection_reason
		   FROM payment_orders
		  WHERE order_id = $1`,
		orderID,
	)
	return scanOrder(row)
}

func loadOrderByIDForUpdate(ctx context.Context, tx *sql.Tx, orderID string) (*dbOrder, error) {
	row := tx.QueryRowContext(
		ctx,
		`SELECT order_id, user_id, user_email, plan_id, plan_name, amount_rub, period, status, verification_token,
		        payment_comment, qr_payload, qr_url, qr_image_url, provider_order_id, provider_status,
		        created_at, expires_at, confirmed_at, verified_at, rejection_reason
		   FROM payment_orders
		  WHERE order_id = $1
		  FOR UPDATE`,
		orderID,
	)
	return scanOrder(row)
}

func scanOrder(row scanner) (*dbOrder, error) {
	order := &dbOrder{}
	err := row.Scan(
		&order.OrderID,
		&order.UserID,
		&order.UserEmail,
		&order.PlanID,
		&order.PlanName,
		&order.AmountRub,
		&order.Period,
		&order.Status,
		&order.VerificationTok,
		&order.PaymentComment,
		&order.QRPayload,
		&order.QRURL,
		&order.QRImageURL,
		&order.ProviderOrderID,
		&order.ProviderStatus,
		&order.CreatedAt,
		&order.ExpiresAt,
		&order.ConfirmedAt,
		&order.VerifiedAt,
		&order.RejectionReason,
	)
	if err != nil {
		return nil, err
	}
	return order, nil
}

func loadSubscription(ctx context.Context, db *sql.DB, userID string) (*dbSubscription, error) {
	row := db.QueryRowContext(
		ctx,
		`SELECT user_id, plan_id, plan_name, status, order_id, activated_at, expires_at
		   FROM user_subscriptions
		  WHERE user_id = $1`,
		userID,
	)
	sub := &dbSubscription{}
	if err := row.Scan(
		&sub.UserID,
		&sub.PlanID,
		&sub.PlanName,
		&sub.Status,
		&sub.OrderID,
		&sub.ActivatedAt,
		&sub.ExpiresAt,
	); err != nil {
		return nil, err
	}
	return sub, nil
}

func toOrderResponse(order *dbOrder, cfg Config, includeToken bool) OrderResponse {
	createdAt := order.CreatedAt.UTC().Format(time.RFC3339)
	resp := OrderResponse{
		OrderID:        order.OrderID,
		Amount:         order.AmountRub,
		Currency:       "RUB",
		PlanName:       order.PlanName,
		Period:         order.Period,
		Status:         order.Status,
		ExpiresAt:      order.ExpiresAt.UTC().Format(time.RFC3339),
		PaymentComment: order.PaymentComment,
		Recipient: Recipient{
			Phone:    cfg.SBPRecipientPhone,
			BankName: cfg.SBPRecipientBankName,
			Name:     cfg.SBPRecipientName,
		},
		CreatedAt: &createdAt,
	}
	if order.QRPayload.Valid {
		resp.QRPayload = order.QRPayload.String
	}
	if order.QRURL.Valid {
		resp.QRURL = order.QRURL.String
	}
	if order.QRImageURL.Valid {
		resp.QRImageURL = order.QRImageURL.String
	}
	if order.ProviderOrderID.Valid {
		resp.ProviderOrderID = order.ProviderOrderID.String
	}
	if order.ProviderStatus.Valid {
		resp.ProviderStatus = order.ProviderStatus.String
	}
	if includeToken {
		resp.Token = order.VerificationTok
	}
	if order.ConfirmedAt.Valid {
		confirmed := order.ConfirmedAt.Time.UTC().Format(time.RFC3339)
		resp.ConfirmedAt = &confirmed
	}
	if order.VerifiedAt.Valid {
		verified := order.VerifiedAt.Time.UTC().Format(time.RFC3339)
		resp.VerifiedAt = &verified
	}
	if order.RejectionReason.Valid && strings.TrimSpace(order.RejectionReason.String) != "" {
		reason := order.RejectionReason.String
		resp.RejectionReason = &reason
	}
	return resp
}

func mustUser(c *gin.Context) (*AuthUser, bool) {
	v, ok := c.Get(userContextKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return nil, false
	}
	user, ok := v.(*AuthUser)
	if !ok || user == nil || user.ID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return nil, false
	}
	return user, true
}

func bearerToken(authHeader string) string {
	parts := strings.SplitN(strings.TrimSpace(authHeader), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func generateOrderID() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	raw, err := randomFromAlphabet(alphabet, 8)
	if err != nil {
		return "", err
	}
	return "AOA-" + raw, nil
}

func generateOrderToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func randomFromAlphabet(alphabet string, n int) (string, error) {
	if n <= 0 {
		return "", nil
	}
	buf := make([]byte, n)
	for i := 0; i < n; i++ {
		idx, err := randomInt(len(alphabet))
		if err != nil {
			return "", err
		}
		buf[i] = alphabet[idx]
	}
	return string(buf), nil
}

func randomInt(max int) (int, error) {
	if max <= 0 {
		return 0, errors.New("max must be positive")
	}
	b := make([]byte, 1)
	for {
		if _, err := rand.Read(b); err != nil {
			return 0, err
		}
		v := int(b[0])
		if v < (256 - (256 % max)) {
			return v % max, nil
		}
	}
}

func envOrDefault(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func envIntOrDefault(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envBoolOrDefault(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func nullTimeToAny(value sql.NullTime) any {
	if !value.Valid {
		return nil
	}
	return value.Time.UTC().Format(time.RFC3339)
}

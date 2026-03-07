package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	statusPending              = "pending"
	statusAwaitingVerification = "awaiting_verification"
	statusConfirmed            = "confirmed"
	statusExpired              = "expired"
	statusRejected             = "rejected"
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL
);

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

const userContextKey = "auth_user"

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
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

		user, err := fetchSupabaseUser(c.Request.Context(), cfg, accessToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired auth token"})
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

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("supabase auth status %d", resp.StatusCode)
	}

	var payload AuthUser
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.ID == "" {
		return nil, errors.New("missing user id from supabase")
	}
	return &payload, nil
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
			   AND status IN ('pending', 'awaiting_verification')
			   AND expires_at > NOW()`,
			user.ID,
			plan.ID,
		).Scan(&pendingCount)
		if err != nil {
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

		_, err = db.ExecContext(
			ctx,
			`INSERT INTO payment_orders (
				order_id, user_id, user_email, plan_id, plan_name, amount_rub, period, status, verification_token,
				payment_comment, created_at, expires_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
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
			Token: token,
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
		        payment_comment, created_at, expires_at, confirmed_at, verified_at, rejection_reason
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
		        payment_comment, created_at, expires_at, confirmed_at, verified_at, rejection_reason
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

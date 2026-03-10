package main

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

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
	// Tochka Bank Acquiring
	TochkaJWTToken      string
	TochkaCustomerCode  string
	TochkaBankCode      string   // default: 044525104
	TochkaAccountID     string   // settlement account (format: account/bik)
	TochkaPaymentMode   []string // e.g. ["sbp"], ["card"], ["sbp","card"]
	TochkaWebhookKeyURL string
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
	tochkaCode := strings.TrimSpace(os.Getenv("TOCHKA_CUSTOMER_CODE"))
	tochkaBankCode := envOrDefault("TOCHKA_BANK_CODE", "044525104")
	tochkaAccountID := strings.TrimSpace(os.Getenv("TOCHKA_ACCOUNT_ID"))
	tochkaPaymentModeRaw := envOrDefault("TOCHKA_PAYMENT_MODE", "sbp")
	var tochkaPaymentMode []string
	for _, m := range strings.Split(tochkaPaymentModeRaw, ",") {
		m = strings.TrimSpace(m)
		if m != "" {
			tochkaPaymentMode = append(tochkaPaymentMode, m)
		}
	}
	if len(tochkaPaymentMode) == 0 {
		tochkaPaymentMode = []string{"sbp"}
	}
	tochkaKeyURL := envOrDefault("TOCHKA_WEBHOOK_KEY_URL", "https://enter.tochka.com/doc/openapi/static/keys/public")
	if providerMode == "tochka" {
		if tochkaJWT == "" {
			return Config{}, errors.New("TOCHKA_JWT_TOKEN is required when SBP_PROVIDER_MODE=tochka")
		}
		if tochkaCode == "" {
			return Config{}, errors.New("TOCHKA_CUSTOMER_CODE is required when SBP_PROVIDER_MODE=tochka")
		}
		if tochkaAccountID == "" {
			return Config{}, errors.New("TOCHKA_ACCOUNT_ID is required when SBP_PROVIDER_MODE=tochka")
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
		TochkaCustomerCode:   tochkaCode,
		TochkaBankCode:       tochkaBankCode,
		TochkaAccountID:      tochkaAccountID,
		TochkaPaymentMode:    tochkaPaymentMode,
		TochkaWebhookKeyURL:  tochkaKeyURL,
	}, nil
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

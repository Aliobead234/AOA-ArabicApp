package main

import (
	"database/sql"
	"time"
)

// ── Status constants ─────────────────────────────────────────────────────────

const (
	statusPending              = "pending"
	statusAwaitingVerification = "awaiting_verification"
	statusConfirmed            = "confirmed"
	statusExpired              = "expired"
	statusRejected             = "rejected"
)

// ── Plans ────────────────────────────────────────────────────────────────────

type Plan struct {
	ID       string
	Name     string
	PriceRub int
	Period   string // "one-time", "monthly", "yearly"
}

var plans = map[string]Plan{
	"starter":  {ID: "starter", Name: "Starter", PriceRub: 299, Period: "one-time"},
	"pro":      {ID: "pro", Name: "Pro", PriceRub: 1, Period: "monthly"},
	"yearly":   {ID: "yearly", Name: "Yearly", PriceRub: 2399, Period: "yearly"},
	"lifetime": {ID: "lifetime", Name: "Lifetime", PriceRub: 2999, Period: "one-time"},
}

// ── Request / Response types ─────────────────────────────────────────────────

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

// ── Database models ──────────────────────────────────────────────────────────

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

// ── Auth model ───────────────────────────────────────────────────────────────

type AuthUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

const userContextKey = "auth_user"

package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

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

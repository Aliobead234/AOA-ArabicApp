package main

import (
	"context"
	gocrypto "crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// tochkaKeyCache caches Tochka's RS256 public key for 24 h to avoid
// fetching it on every webhook call.
var tochkaKeyCache struct {
	sync.RWMutex
	pem     []byte
	fetchAt time.Time
}

// createTochkaPaymentLink creates a payment via Tochka's acquiring API:
// POST /uapi/acquiring/v1.0/payments
// Returns a paymentLink the user opens to complete payment (supports SBP, card, T-Pay).
func createTochkaPaymentLink(ctx context.Context, cfg Config, orderID string, plan Plan) (sbpQRData, error) {
	if cfg.TochkaAccountID == "" || cfg.TochkaCustomerCode == "" {
		return sbpQRData{}, errors.New("TOCHKA_ACCOUNT_ID and TOCHKA_CUSTOMER_CODE are required")
	}

	accountID := cfg.TochkaAccountID
	if !strings.Contains(accountID, "/") {
		accountID = accountID + "/" + cfg.TochkaBankCode
	}

	ttlMinutes := int(cfg.OrderTTL.Minutes())
	if ttlMinutes < 1 {
		ttlMinutes = 30
	}

	body := map[string]any{
		"Data": map[string]any{
			"amount":       float64(plan.PriceRub),
			"purpose":      fmt.Sprintf("AOA Flashcards: %s (%s)", plan.Name, orderID),
			"accountId":    accountID,
			"customerCode": cfg.TochkaCustomerCode,
			"paymentMode":  cfg.TochkaPaymentMode,
			"ttl":          ttlMinutes,
		},
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return sbpQRData{}, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, cfg.SBPProviderTimeout)
	defer cancel()

	apiURL := "https://enter.tochka.com/uapi/acquiring/v1.0/payments"

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, apiURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return sbpQRData{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.TochkaJWTToken)

	resp, err := (&http.Client{Timeout: cfg.SBPProviderTimeout}).Do(req)
	if err != nil {
		return sbpQRData{}, fmt.Errorf("tochka acquiring request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return sbpQRData{}, fmt.Errorf("tochka acquiring error: status=%d body=%s",
			resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var result struct {
		Data struct {
			OperationID string   `json:"operationId"`
			PaymentLink string   `json:"paymentLink"`
			Status      string   `json:"status"`
			PaymentMode []string `json:"paymentMode"`
		} `json:"Data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return sbpQRData{}, fmt.Errorf("tochka acquiring parse error: %w", err)
	}
	if result.Data.PaymentLink == "" {
		return sbpQRData{}, fmt.Errorf("tochka acquiring: empty paymentLink in response: %s", string(respBody))
	}

	log.Printf("tochka: created payment %s link=%s status=%s",
		result.Data.OperationID, result.Data.PaymentLink, result.Data.Status)

	imageURL, _ := generateQRDataURL(result.Data.PaymentLink)

	return sbpQRData{
		Payload:         result.Data.PaymentLink,
		URL:             result.Data.PaymentLink,
		ImageURL:        imageURL,
		ProviderOrderID: result.Data.OperationID,
		ProviderStatus:  result.Data.Status,
	}, nil
}

// pollTochkaPaymentStatus checks the current status of a Tochka acquiring payment.
func pollTochkaPaymentStatus(ctx context.Context, cfg Config, operationID string) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, cfg.SBPProviderTimeout)
	defer cancel()

	apiURL := "https://enter.tochka.com/uapi/acquiring/v1.0/payments/" + operationID
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, apiURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.TochkaJWTToken)

	resp, err := (&http.Client{Timeout: cfg.SBPProviderTimeout}).Do(req)
	if err != nil {
		return "", fmt.Errorf("tochka status poll failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("tochka status poll error: status=%d body=%s",
			resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var result struct {
		Data struct {
			Operation []struct {
				Status string `json:"status"`
			} `json:"Operation"`
		} `json:"Data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("tochka status parse error: %w", err)
	}
	if len(result.Data.Operation) == 0 {
		return "", fmt.Errorf("tochka status: no operations in response")
	}

	return result.Data.Operation[0].Status, nil
}

// fetchTochkaPublicKey downloads Tochka's RS256 public key and caches it for 24 hours.
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

// verifyRS256JWT verifies a JWT signed with RS256 using the provided PEM public key.
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

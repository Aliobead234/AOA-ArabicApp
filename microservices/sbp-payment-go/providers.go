package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

// ── SBP QR creation (dispatches by provider mode) ────────────────────────────

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

// ── Webhook handling ─────────────────────────────────────────────────────────

func providerWebhookHandler(db *sql.DB, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook body"})
			return
		}

		payload := map[string]any{}

		if cfg.SBPProviderMode == "tochka" {
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

// ── Webhook payload extraction ───────────────────────────────────────────────

func extractWebhookOrderID(payload map[string]any) string {
	if orderID := firstNonEmpty(
		stringFromMap(payload, "orderId"),
		stringFromMap(payload, "order_id"),
		stringFromMap(payload, "merchantOrderId"),
		stringFromMap(payload, "merchant_order_id"),
		stringFromMap(payload, "invoiceId"),
		stringFromMap(payload, "invoice_id"),
		stringFromMap(payload, "purpose"),
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
	case "paid", "succeeded", "success", "confirmed", "completed", "approved":
		return statusConfirmed
	case "created":
		return statusPending
	case "awaiting_verification", "processing", "pending", "waiting", "authorized":
		return statusAwaitingVerification
	case "failed", "rejected", "declined", "canceled", "cancelled", "refunded", "expired":
		return statusRejected
	default:
		return ""
	}
}

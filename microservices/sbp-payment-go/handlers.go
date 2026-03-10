package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

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
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
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
			log.Printf("failed to insert order %s: %v", orderID, err)
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

		// Poll Tochka acquiring for payment status update if order is still pending.
		if cfg.SBPProviderMode == "tochka" && order.ProviderOrderID.Valid &&
			order.ProviderOrderID.String != "" &&
			(order.Status == statusPending || order.Status == statusAwaitingVerification) {

			tochkaStatus, err := pollTochkaPaymentStatus(c.Request.Context(), cfg, order.ProviderOrderID.String)
			if err != nil {
				log.Printf("tochka poll failed for order %s op %s: %v", order.OrderID, order.ProviderOrderID.String, err)
			} else {
				normalized := normalizeProviderStatus(tochkaStatus)
				if normalized != "" && normalized != order.Status {
					log.Printf("tochka poll: order %s status changed %s -> %s (provider: %s)",
						order.OrderID, order.Status, normalized, tochkaStatus)
					if applyErr := applyProviderOrderUpdate(
						c.Request.Context(), db, cfg,
						order.OrderID, order.ProviderOrderID.String, tochkaStatus, normalized,
					); applyErr != nil {
						log.Printf("tochka poll: failed to apply update for order %s: %v", order.OrderID, applyErr)
					} else {
						if updated, err := loadOrderByID(c.Request.Context(), db, orderID); err == nil {
							order = updated
						}
					}
				}
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

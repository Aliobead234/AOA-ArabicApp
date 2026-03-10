package main

import (
	"context"
	"database/sql"
	"time"
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
  period TEXT NOT NULL CHECK (period IN ('one-time', 'monthly', 'yearly')),
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

func runMigrations(db *sql.DB) error {
	_, err := db.Exec(schemaSQL)
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

func activateSubscription(ctx context.Context, tx *sql.Tx, order *dbOrder, cfg Config) error {
	activatedAt := time.Now().UTC()
	var expiresAt any
	if order.Period == "monthly" {
		expiresAt = activatedAt.Add(time.Duration(cfg.MonthlyDurationDays) * 24 * time.Hour)
	} else if order.Period == "yearly" {
		expiresAt = activatedAt.Add(365 * 24 * time.Hour)
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

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

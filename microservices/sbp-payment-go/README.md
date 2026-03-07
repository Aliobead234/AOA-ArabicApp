# SBP Payment Microservice (Go + Gin)

This service implements Russian SBP transfer flow for AOA plans:
- create order
- show transfer details (phone, bank, amount, payment comment)
- confirm payment
- verify payment (manual admin endpoint, with optional auto-verify for development)
- read active subscription

It follows the migration notes from `migration-roadmap (1).jsx`:
- Supabase auth remains active during migration.
- Payment routes are isolated and can be switched by feature flag.
- Data is in clear PostgreSQL tables with standard SQL.

## Endpoints

- `GET /healthz`
- `POST /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders/:id/confirm`
- `GET /api/v1/subscription`
- `POST /api/v1/admin/orders/:id/verify` (requires `X-Admin-Token`)

## Environment

Copy `.env.example` and fill values:

- `DATABASE_URL`: PostgreSQL DSN
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: used to validate incoming user access tokens against Supabase Auth
- `SBP_RECIPIENT_*`: receiver details shown in UI
- `ADMIN_TOKEN`: required for manual verify endpoint

## Run

```bash
go mod tidy
go run .
```

By default service listens on `:8080`.

## Frontend switch

Frontend payment calls are now centralized in:

- `src/app/services/paymentService.ts`

Feature flags:

- `VITE_PAYMENT_BACKEND_MODE=supabase|microservice|hybrid`
- `VITE_PAYMENT_MICRO_BASE_URL=http://localhost:8080`
- `VITE_PAYMENT_MICRO_TIMEOUT_MS=8000`

Recommended migration sequence:

1. Start with `supabase` (current behavior).
2. Use `hybrid` to send payment traffic to microservice with automatic fallback.
3. Move to `microservice` once stable.


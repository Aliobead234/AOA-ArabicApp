# SBP Payment Microservice (Go + Gin)

This service implements Russian SBP transfer flow for AOA plans:
- create order
- return SBP QR payment data (payload/url/image)
- confirm payment
- process provider webhook updates
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
- `POST /api/v1/provider/webhook/sbp` (provider callback)
- `POST /api/v1/admin/orders/:id/verify` (requires `X-Admin-Token`)

## Environment

Copy `.env.example` and fill values:

- `DATABASE_URL`: PostgreSQL DSN
- `SUPABASE_URL`: Supabase project URL (must match frontend project)
- `SUPABASE_ANON_KEY`: used to validate incoming user access tokens against Supabase Auth (must match frontend project)
- `SBP_RECIPIENT_*`: receiver details shown in UI
- `SBP_PROVIDER_MODE`: `mock` or `http`
- `SBP_PROVIDER_CREATE_URL`: provider order-create endpoint (`http` mode)
- `SBP_PROVIDER_API_KEY`: provider API key/token (`http` mode)
- `SBP_PROVIDER_TIMEOUT_SECONDS`: provider request timeout
- `SBP_WEBHOOK_SECRET`: protects `/api/v1/provider/webhook/sbp`
- `ADMIN_TOKEN`: required for manual verify endpoint

Important:
- If frontend uses `src/utils/supabase/info.ts` project `xmhqgwrwezonofhvukpp`, this service must use that same Supabase URL/key pair.
- A mismatch between frontend project and microservice `SUPABASE_*` values causes auth failures that look like "session expired or invalid".

## Run

```bash
go mod tidy
go run .
```

By default service listens on `:8080`.

The service autoloads `.env` from the microservice directory. You can still override with exported environment variables.

## Auth behavior

- `401`: token is missing/invalid/expired.
- `503`: Supabase auth backend is unavailable or misconfigured.

This distinction prevents forcing users to sign in again when the real issue is service availability/configuration.

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

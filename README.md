
  # AOA-Backend

  This is a code bundle for AOA-Backend. The original project is available at https://www.figma.com/design/t4RejKG0VMQ9wD7ltOtXiA/AOA-Backend.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deploy on Vercel

  Added deployment config:

  - `vercel.json` (Vite output + SPA rewrites)
  - `.env.example` (production env template)
  - `vite.config.ts` now uses `VITE_PUBLIC_BASE_PATH` (default `/`)

  ### Vercel project settings

  - Framework: `Vite`
  - Build Command: `npm run build`
  - Output Directory: `dist`

  ### Required Vercel environment variables

  - `VITE_PUBLIC_BASE_PATH=/`
  - `VITE_PAYMENT_BACKEND_MODE=supabase` (recommended first deploy)
  - `VITE_PAYMENT_MICRO_BASE_URL` only if using external Go microservice
  - `VITE_PAYMENT_MICRO_TIMEOUT_MS=8000`

  ### Important payment note

  The Go payment microservice in `microservices/sbp-payment-go` is not hosted by this static Vercel frontend deployment.
  Deploy it separately (Railway/Render/Fly/etc.) and then set `VITE_PAYMENT_MICRO_BASE_URL` to its public URL.

  ## Payment microservice (SBP, Go)

  A migration-safe SBP payment microservice is available in:

  - `microservices/sbp-payment-go`

  Frontend payment routing is controlled by Vite env flags:

  - `VITE_PAYMENT_BACKEND_MODE=supabase|microservice|hybrid`
  - `VITE_PAYMENT_MICRO_BASE_URL=http://localhost:8080`
  - `VITE_PAYMENT_MICRO_TIMEOUT_MS=8000`

  For stable rollout, start with:

  - `VITE_PAYMENT_BACKEND_MODE=hybrid`

  This uses the Go microservice first and falls back to Supabase payment endpoints if microservice is unavailable.
  

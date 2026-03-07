
  # AOA-Backend

  This is a code bundle for AOA-Backend. The original project is available at https://www.figma.com/design/t4RejKG0VMQ9wD7ltOtXiA/AOA-Backend.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Payment microservice (SBP, Go)

  A migration-safe SBP payment microservice is available in:

  - `microservices/sbp-payment-go`

  Frontend payment routing is controlled by Vite env flags:

  - `VITE_PAYMENT_BACKEND_MODE=supabase|microservice|hybrid`
  - `VITE_PAYMENT_MICRO_BASE_URL=http://localhost:8080`
  - `VITE_PAYMENT_MICRO_TIMEOUT_MS=8000`
  

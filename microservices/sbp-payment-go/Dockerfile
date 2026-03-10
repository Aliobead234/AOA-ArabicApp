FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /sbp-payment-go .

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /sbp-payment-go /usr/local/bin/sbp-payment-go

EXPOSE 8080

ENTRYPOINT ["sbp-payment-go"]

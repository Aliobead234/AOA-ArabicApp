#!/usr/bin/env bash
# SBP Payment microservice — build, run, and test
# Usage: bash test.sh <supabase_access_token>
#
# How to get a fresh token:
#   1. Open http://localhost:5173 and sign in
#   2. Run in DevTools console:
#      JSON.parse(localStorage.getItem('aoa-auth-session-xmhqgwrwezonofhvukpp')).access_token
#   3. Copy the output and pass as $1

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN="${1:-}"
PORT=8081
BASE="http://localhost:$PORT"

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "==> Building..."
cd "$DIR"
go build -o sbp-payment-go.exe .
echo "    OK"

# ── 2. Stop old instance ──────────────────────────────────────────────────────
echo "==> Stopping old instance on :$PORT (if any)..."
PID=$(netstat -ano 2>/dev/null | grep ":$PORT " | awk '{print $5}' | head -1)
if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  cmd //c "taskkill /PID $PID /F" 2>/dev/null || true
  sleep 1
fi

# ── 3. Start server ───────────────────────────────────────────────────────────
echo "==> Starting server..."
./sbp-payment-go.exe > /tmp/sbp.log 2>&1 &
sleep 2

# ── 4. Health check ───────────────────────────────────────────────────────────
echo "==> Health check..."
curl -sf "$BASE/healthz" | python -m json.tool 2>/dev/null || curl -s "$BASE/healthz"
echo

# ── 5. Auth test (no token) ───────────────────────────────────────────────────
echo "==> Auth guard (expect 401)..."
curl -s -X POST "$BASE/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d '{"planId":"pro"}' | python -m json.tool 2>/dev/null || true
echo

# ── 6. Order creation (requires valid token) ─────────────────────────────────
if [ -z "$TOKEN" ]; then
  echo "==> Skipping order test — no token provided."
  echo "    Rerun: bash test.sh <access_token>"
else
  echo "==> Creating order (planId=pro, 1 rub)..."
  curl -s -X POST "$BASE/api/v1/orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"planId":"pro"}' | python -m json.tool 2>/dev/null || curl -s -X POST "$BASE/api/v1/orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"planId":"pro"}'
  echo

  echo "==> Subscription status..."
  curl -s "$BASE/api/v1/subscription" \
    -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || true
  echo
fi

echo "==> Server log tail:"
tail -5 /tmp/sbp.log

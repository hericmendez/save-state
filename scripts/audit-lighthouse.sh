#!/usr/bin/env bash
# Auditoria Lighthouse — Save State (build de produção, banco isolado E2E).
#
# Uso:
#   1. pnpm build && (E2E) pnpm start -- --port 3101   # ou deixe o webServer do Playwright subir
#   2. bash scripts/audit-lighthouse.sh [BASE_URL]
#
# Autenticação: cria usuário exclusivo via API, faz login e injeta o cookie
# `token` via --extra-headers. As páginas autenticadas são auditadas LOGADAS.
set -euo pipefail

BASE_URL="${1:-http://localhost:3101}"
OUT_DIR="lighthouse-report"
CHROME_PATH="${CHROME_PATH:-$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome}"

if [ ! -x "$CHROME_PATH" ]; then
  echo "Chrome não encontrado em $CHROME_PATH. Exporte CHROME_PATH." >&2
  exit 1
fi

if ! curl -sf -o /dev/null "$BASE_URL/api/health"; then
  echo "Servidor não responde em $BASE_URL (esperado: next start de produção)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

STAMP="$(date +%s)-$RANDOM"
EMAIL="lh-${STAMP}@e2e.local"
PASS="lh-Password-123"

curl -sf -o /dev/null -X POST "$BASE_URL/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Lighthouse ${STAMP}\",\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"

COOKIE_JAR="$(mktemp)"
curl -sf -o /dev/null -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"

TOKEN="$(awk '/token/{print $NF}' "$COOKIE_JAR")"
rm -f "$COOKIE_JAR"

if [ -z "$TOKEN" ]; then
  echo "Falha ao obter cookie de sessão para o Lighthouse." >&2
  exit 1
fi

HEADERS_FILE="$(mktemp)"
printf '{"Cookie":"token=%s"}\n' "$TOKEN" > "$HEADERS_FILE"

export CHROME_PATH
run_lh() {
  local route="$1" mode="$2" slug="$3" extra_headers="$4"
  local extra=()
  if [ "$extra_headers" = "auth" ]; then
    extra+=(--extra-headers "$HEADERS_FILE")
  fi
  if [ "$mode" = "desktop" ]; then
    extra+=(--preset desktop)
  fi
  npx lighthouse "$BASE_URL$route" \
    --chrome-flags="--no-sandbox --headless=new" \
    --output=json --output=html \
    --output-path "$OUT_DIR/${slug}-${mode}" \
    --throttling-method=simulate \
    "${extra[@]}" \
    --quiet 2>/dev/null || echo "AVISO: lighthouse falhou para $route [$mode]"
}

for preset in desktop mobile; do
  run_lh "/login" "$preset" "login" "noauth"
  run_lh "/home" "$preset" "home" "auth"
  run_lh "/dashboard" "$preset" "dashboard" "auth"
  run_lh "/backlog" "$preset" "backlog" "auth"
done

rm -f "$HEADERS_FILE"

node scripts/summarize-lighthouse.mjs "$OUT_DIR"

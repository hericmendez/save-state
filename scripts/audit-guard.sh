#!/usr/bin/env bash
# Guarda de pré-execução da auditoria: falha rápido se o servidor de
# produção ou o build estiverem inconsistentes (evita suítes inválidas).
set -euo pipefail

BASE_URL="${1:-http://localhost:3101}"
MIN_FILES="${2:-140}"

PAGES="$(find .next/server/app -name '*.js' 2>/dev/null | wc -l)"
echo "arquivos js de servidor em .next: $PAGES (mínimo: $MIN_FILES)"
if [ "$PAGES" -lt "$MIN_FILES" ]; then
  echo "GUARD-FAIL: build incompleto ou corrompido. Rode 'pnpm build' e verifique." >&2
  exit 1
fi

HEALTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/api/health")"
echo "GET /api/health -> $HEALTH"
if [ "$HEALTH" != "200" ]; then
  echo "GUARD-FAIL: servidor de produção fora do ar em $BASE_URL." >&2
  exit 1
fi

LOGIN="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/login")"
echo "GET /login -> $LOGIN"
if [ "$LOGIN" != "200" ]; then
  echo "GUARD-FAIL: SSR quebrado (esperado 200 em /login)." >&2
  exit 1
fi

BACKLOG="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/backlog")"
echo "GET /backlog (anônimo) -> $BACKLOG (esperado 307)"
if [ "$BACKLOG" != "307" ]; then
  echo "GUARD-FAIL: redirect de auth inesperado." >&2
  exit 1
fi

echo "GUARD-OK"

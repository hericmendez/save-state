#!/usr/bin/env bash
set -euo pipefail

# Run Save State + ATP Engine concurrently with a single pnpm command.
# - ATP Engine keeps default PORT=3000
# - Save State is forced to PORT=3001 to avoid collision
# - ATP is started first; Save State only starts after ATP health endpoint is reachable
#
# Usage:
#   pnpm dev              # from repo root (calls this script via package.json)
#   ./scripts/dev.sh      # direct
#   pnpm dev:concurrently # alternative (concurrently + wait-on without sequential wait loop)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ATP_PORT="${ATP_PORT:-3000}"
SAVE_PORT="${SAVE_PORT:-3001}"
ATP_URL="http://localhost:${ATP_PORT}/health"
TIMEOUT_SEC=120

# Colors (safe fallback if tput unavailable)
_cyan="$(tput setaf 6 2>/dev/null || echo "")"
_magenta="$(tput setaf 5 2>/dev/null || echo "")"
_green="$(tput setaf 2 2>/dev/null || echo "")"
_yellow="$(tput setaf 3 2>/dev/null || echo "")"
_reset="$(tput sgr0 2>/dev/null || echo "")"

echo "${_cyan}▶ Starting ATP Engine on :${ATP_PORT} ...${_reset}"
echo "  → pnpm --filter atp-engine dev (PORT=${ATP_PORT})"

# Prefer workspace-aware --filter; fallback to --dir if workspace not configured
if grep -q "atp-engine" "$ROOT_DIR/pnpm-workspace.yaml" 2>/dev/null; then
  PORT="$ATP_PORT" pnpm --filter atp-engine dev &
else
  PORT="$ATP_PORT" pnpm --dir "$ROOT_DIR/atp-engine" dev &
fi
ATP_PID=$!

cleanup() {
  echo ""
  echo "${_yellow}↳ Shutting down...${_reset}"
  # Kill both children if still running
  kill "$ATP_PID" 2>/dev/null || true
  if [[ -n "${SAVE_PID:-}" ]]; then
    kill "$SAVE_PID" 2>/dev/null || true
  fi
  # Give them a moment to exit gracefully, then hard kill
  sleep 1
  kill -9 "$ATP_PID" 2>/dev/null || true
  if [[ -n "${SAVE_PID:-}" ]]; then
    kill -9 "$SAVE_PID" 2>/dev/null || true
  fi
  # Remove trap to avoid re-entry on EXIT
  trap - INT TERM EXIT
  # Return non-zero if called from error path, else 0
  exit 0
}
trap cleanup INT TERM EXIT

# --- Wait for ATP to become healthy before starting Save State ---
echo "${_yellow}⏳ Waiting for ATP Engine to be ready at ${ATP_URL} (timeout ${TIMEOUT_SEC}s)...${_reset}"

wait_with_wait_on() {
  # Use pnpm's wait-on if available (installed at root), else npx fallback
  if pnpm --help 2>/dev/null | grep -q wait-on; then
    true
  fi
  if command -v wait-on >/dev/null 2>&1; then
    wait-on "$ATP_URL" --timeout $((TIMEOUT_SEC*1000)) --interval 1000 --verbose
    return $?
  elif npx --yes wait-on --help >/dev/null 2>&1; then
    npx --yes wait-on "$ATP_URL" --timeout $((TIMEOUT_SEC*1000)) --interval 1000 --verbose
    return $?
  else
    return 127
  fi
}

if wait_with_wait_on; then
  echo "${_green}✓ ATP Engine is ready.${_reset}"
else
  rc=$?
  if [[ $rc -eq 127 ]]; then
    echo "  wait-on not found, falling back to curl polling..."
    for i in $(seq 1 "$TIMEOUT_SEC"); do
      if curl -fs "$ATP_URL" >/dev/null 2>&1; then
        echo "${_green}✓ ATP Engine is ready (after ${i}s, curl probe).${_reset}"
        break
      fi
      if ! kill -0 "$ATP_PID" 2>/dev/null; then
        echo "✗ ATP Engine process (pid $ATP_PID) exited before becoming healthy."
        wait "$ATP_PID" || true
        exit 1
      fi
      sleep 1
      if [[ "$i" -eq "$TIMEOUT_SEC" ]]; then
        echo "✗ Timeout after ${TIMEOUT_SEC}s waiting for $ATP_URL"
        echo "  Check ATP logs above; ensuring MongoDB is running and PORT ${ATP_PORT} is free."
        exit 1
      fi
      # Print progress every 10s
      if [[ $((i % 10)) -eq 0 ]]; then
        echo "  ... still waiting (${i}s elapsed)"
      fi
    done
  else
    echo "✗ Failed waiting for ATP (wait-on exit code $rc)"
    if ! kill -0 "$ATP_PID" 2>/dev/null; then
      echo "  ATP process exited. Check logs above."
    fi
    exit 1
  fi
fi

echo ""
echo "${_magenta}▶ Starting Save State on :${SAVE_PORT} (ATP is healthy) ...${_reset}"
echo "  → PORT=${SAVE_PORT} pnpm --filter save-state dev"
echo "  → ATP_BASE_URL should remain http://localhost:${ATP_PORT} (see save-state/.env)"

if grep -q "save-state" "$ROOT_DIR/pnpm-workspace.yaml" 2>/dev/null; then
  PORT="$SAVE_PORT" pnpm --filter save-state dev &
else
  PORT="$SAVE_PORT" pnpm --dir "$ROOT_DIR/save-state" dev &
fi
SAVE_PID=$!

echo ""
echo "${_green}✓ Both services running:${_reset}"
echo "  ${_cyan}ATP Engine → http://localhost:${ATP_PORT}  (health: ${ATP_URL})${_reset}"
echo "  ${_magenta}Save State → http://localhost:${SAVE_PORT}${_reset}"
echo ""
echo "  Press Ctrl+C to stop both."
echo ""

# Wait for either to exit; trap will clean up the other.
wait "$ATP_PID" "$SAVE_PID"

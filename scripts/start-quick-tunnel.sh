#!/usr/bin/env bash
set -euo pipefail

TUNNEL_LOG="/tmp/paper_companion_tunnel.log"
SESSION_NAME="paper_companion_tunnel"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required for the quick tunnel helper." >&2
  exit 1
fi

if [ ! -x "$HOME/.local/bin/cloudflared" ]; then
  mkdir -p "$HOME/.local/bin"
  curl -L --fail -o "$HOME/.local/bin/cloudflared" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$HOME/.local/bin/cloudflared"
fi

tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
: > "$TUNNEL_LOG"
tmux new-session -d -s "$SESSION_NAME" \
  "$HOME/.local/bin/cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000 --no-autoupdate 2>&1 | tee $TUNNEL_LOG"

echo "Waiting for Cloudflare Quick Tunnel URL..."
for _ in {1..30}; do
  URL=$(grep -o 'https://[-a-zA-Z0-9.]*trycloudflare.com' "$TUNNEL_LOG" | tail -1 || true)
  if [ -n "$URL" ]; then
    echo "$URL"
    exit 0
  fi
  sleep 1
done

echo "Tunnel started but no URL was found yet. Check $TUNNEL_LOG." >&2
exit 1

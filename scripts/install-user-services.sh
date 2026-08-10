#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/data2/yangky/test/paper_companion"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

mkdir -p "$SYSTEMD_USER_DIR"
cp "$PROJECT_DIR/infra/systemd/user/paper-companion-web.service" "$SYSTEMD_USER_DIR/"
cp "$PROJECT_DIR/infra/systemd/user/paper-companion-tunnel.service" "$SYSTEMD_USER_DIR/"

systemctl --user daemon-reload
systemctl --user enable paper-companion-web.service

echo "Installed paper-companion-web.service"
echo "Run this after setting CLOUDFLARE_TUNNEL_TOKEN in $PROJECT_DIR/.env:"
echo "  systemctl --user enable --now paper-companion-tunnel.service"

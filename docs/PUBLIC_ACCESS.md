# Public Access Deployment Notes

The development server can listen on all network interfaces with:

```bash
cd /data2/yangky/test/paper_companion/apps/web
npm run dev -- --hostname 0.0.0.0 --port 3000
```

This only makes the app reachable on networks that can route to the server. The address `100.99.234.5` is a private Tailscale address and is not public internet access.

## Current Temporary Public URL

A Cloudflare Quick Tunnel can expose the local Next.js server without changing firewall or NAT settings. The helper uses Cloudflare HTTP/2 transport because it has been more stable than QUIC on the current server network:

```bash
scripts/start-quick-tunnel.sh
```

Read the generated URL:

```bash
grep -o 'https://[-a-zA-Z0-9.]*trycloudflare.com' /tmp/paper_companion_tunnel.log | tail -1
```

Stop the temporary tunnel:

```bash
tmux kill-session -t paper_companion_tunnel
```

Quick Tunnel URLs are temporary and are not suitable for the final production deployment.

## Production Recommendation

Use one of these stable public access options:

1. Cloudflare named tunnel with a custom domain.
2. Public server IP with inbound ports 80/443 open, plus Nginx or Caddy reverse proxy to the Next.js app.
3. Dedicated application platform for the web app, with Ollama and workers kept on the GPU server behind a private service endpoint.

For this project, option 1 is preferred because the current server is reachable through Tailscale/private networking but direct public ingress to `183.6.9.104:3000` did not work during testing.

## Production Setup With Cloudflare Named Tunnel

1. Create a Cloudflare named tunnel in the Cloudflare dashboard or CLI.
2. Route a hostname such as `paper.your-domain.com` to `http://127.0.0.1:3000`.
3. Add the generated token to `/data2/yangky/test/paper_companion/.env`:

```bash
CLOUDFLARE_TUNNEL_TOKEN=your-token-here
```

4. Build the app and install user services:

```bash
cd /data2/yangky/test/paper_companion
npm install
npm run build
scripts/install-user-services.sh
systemctl --user enable --now paper-companion-web.service
systemctl --user enable --now paper-companion-tunnel.service
```

5. Check service status:

```bash
systemctl --user status paper-companion-web.service
systemctl --user status paper-companion-tunnel.service
journalctl --user -u paper-companion-web.service -f
journalctl --user -u paper-companion-tunnel.service -f
```

This gives the project a stable public HTTPS URL through Cloudflare while keeping the Next.js app bound to the local server port.

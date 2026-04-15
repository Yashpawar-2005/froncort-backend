#!/bin/bash
set -e

DOMAIN="wadassignment.duckdns.org"
EMAIL=""   # Change this to your email for certbot alerts
API_PORT=3000
WS_PORT=3001

echo "==> Installing Nginx and Certbot..."
sudo apt update -y
sudo apt install -y nginx certbot python3-certbot-nginx

echo "==> Writing initial Nginx config (HTTP only, for certbot verification)..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # REST API + Socket.IO
    location / {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # y-websocket — trailing slash on BOTH sides strips the /ws/ prefix
    # Client: wss://domain/ws/123  →  backend receives req.url = "/123" ✓
    location /ws/ {
        proxy_pass http://127.0.0.1:$WS_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

echo "==> Enabling site..."
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
sudo rm -f /etc/nginx/sites-enabled/default

echo "==> Testing Nginx config..."
sudo nginx -t

echo "==> Reloading Nginx..."
sudo systemctl reload nginx

echo "==> Obtaining SSL certificate via Certbot..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

echo "==> Ensuring Certbot auto-renew timer is active..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo ""
echo "✅ Nginx + SSL setup complete!"
echo "   API:       https://$DOMAIN"
echo "   WebSocket: wss://$DOMAIN/ws"
echo ""
echo "📋 To verify:"
echo "   curl https://$DOMAIN/api/v1/auth/..."
echo "   sudo nginx -t && sudo systemctl status nginx"

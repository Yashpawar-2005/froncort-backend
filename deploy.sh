#!/bin/bash
set -e

# Resolve the project root relative to this script's location
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Starting Redis via Docker..."
docker compose up -d redis

# Copy root .env to both sub-projects
echo "==> Syncing .env to backend and updatedocs..."
cp "$ROOT/.env" "$ROOT/backend/.env"
cp "$ROOT/.env" "$ROOT/updatedocs/.env"

echo "==> Installing & building backend (API)..."
cd "$ROOT/backend"
npm install
npm run build

echo "==> Running Prisma migrations..."
npx prisma migrate deploy

echo "==> Installing & building updatedocs (Workers)..."
cd "$ROOT/updatedocs"
npm install
npm run build

echo "==> Starting/Reloading PM2..."
cd "$ROOT"
pm2 start ecosystem.config.js || pm2 reload ecosystem.config.js
pm2 save

echo ""
echo "✅ Deployment complete!"
echo "📋 Run 'pm2 list' to see process status."
echo "📜 Run 'pm2 logs' to monitor both processes."

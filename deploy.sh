#!/bin/bash
set -e

# Resolve the project root relative to this script's location
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Clearing old build files (dist)..."
rm -rf "$ROOT/backend/dist"
rm -rf "$ROOT/updatedocs/dist"

echo "==> Starting Redis via Docker..."
docker compose up -d redis

# Copy root .env to both sub-projects
echo "==> Syncing .env to backend and updatedocs..."
cp "$ROOT/.env" "$ROOT/backend/.env"
cp "$ROOT/.env" "$ROOT/updatedocs/.env"

echo "==> [1/2] Installing & building backend (API)..."
cd "$ROOT/backend"
npm install
npm run build

echo "==> Running Prisma migrations..."
npx prisma migrate deploy

echo "==> [2/2] Installing & building updatedocs (Workers)..."
cd "$ROOT/updatedocs"
npm install
npm run build

echo "==> Restarting PM2 processes..."
cd "$ROOT"
# restart will completely kill and start the processes fresh
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✅ Clean deployment complete!"
echo "📋 Run 'pm2 list' to see process status."
echo "📜 Run 'pm2 logs' to monitor both processes."

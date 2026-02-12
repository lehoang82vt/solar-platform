#!/bin/bash

# Script đơn giản để update từ main branch
# Chạy: bash deploy/update-from-main.sh

set -e

APP_DIR="/var/www/solar"

echo "=================================="
echo "Update từ main branch"
echo "=================================="
echo ""

cd "$APP_DIR" || exit 1

# Kiểm tra branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Branch hiện tại: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Đang chuyển sang branch main..."
  git checkout main
fi

# Pull code mới nhất
echo "🔄 Pulling code từ main..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build frontend
echo "🔨 Building frontend..."
cd "$APP_DIR/packages/frontend"
rm -rf .next
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
cd "$APP_DIR"
pm2 restart solar-frontend

# Kiểm tra
echo ""
echo "=================================="
echo "✅ Update Complete!"
echo "=================================="
echo ""
pm2 status solar-frontend
echo ""
echo "Kiểm tra logs:"
pm2 logs solar-frontend --lines 5 --nostream

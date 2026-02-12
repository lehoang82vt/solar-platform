#!/bin/bash

# Script khẩn cấp để fix VPS - chuyển sang main và update
# Chạy: bash deploy/FIX-VPS-NOW.sh

set -e

APP_DIR="/var/www/solar"

echo "=================================="
echo "FIX VPS - Chuyển sang main branch"
echo "=================================="
echo ""

cd "$APP_DIR" || exit 1

# Kiểm tra branch hiện tại
CURRENT_BRANCH=$(git branch --show-current)
echo "⚠️  Branch hiện tại: $CURRENT_BRANCH"
echo "⚠️  Đang chuyển sang main branch..."

# Stash any local changes
git stash || true

# Fetch tất cả branches
git fetch origin

# Checkout main
git checkout main

# Pull code mới nhất
echo "🔄 Pulling code mới nhất từ main..."
git pull origin main

# Kiểm tra commit mới nhất
echo ""
echo "📋 Commit mới nhất:"
git log --oneline -1

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build frontend - XÓA cache cũ
echo ""
echo "🔨 Building frontend (xóa cache cũ)..."
cd "$APP_DIR/packages/frontend"
rm -rf .next
npm run build

# Kiểm tra file settings có chưa
echo ""
echo "✅ Kiểm tra file settings:"
if [ -f "src/app/(sales)/sales/settings/page.tsx" ]; then
  echo "   ✓ File settings tồn tại"
else
  echo "   ✗ File settings KHÔNG tồn tại - có vấn đề!"
  exit 1
fi

# Restart PM2
echo ""
echo "🔄 Restarting PM2..."
cd "$APP_DIR"
pm2 restart solar-frontend

# Kiểm tra
echo ""
echo "=================================="
echo "✅ Hoàn tất!"
echo "=================================="
echo ""
echo "PM2 Status:"
pm2 status solar-frontend
echo ""
echo "Để xem logs: pm2 logs solar-frontend"

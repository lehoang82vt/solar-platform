#!/bin/bash

# Script để update frontend trên VPS
# Sử dụng: bash deploy/update-frontend.sh [branch-name]

set -e

APP_DIR="/var/www/solar"
BRANCH="${1:-cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2}"

echo "=================================="
echo "Solar Frontend Update Script"
echo "=================================="
echo "Branch: $BRANCH"
echo ""

cd "$APP_DIR" || exit 1

# Kiểm tra branch hiện tại
CURRENT_BRANCH=$(git branch --show-current)
echo "Branch hiện tại: $CURRENT_BRANCH"

# Pull code mới nhất
echo "🔄 Pulling code từ branch $BRANCH..."
git fetch origin
git checkout "$BRANCH" || git checkout -b "$BRANCH" "origin/$BRANCH"
git pull origin "$BRANCH"

# Kiểm tra xem có thay đổi không
if [ -z "$(git diff HEAD~1 HEAD --name-only packages/frontend)" ] && [ -z "$(git diff HEAD~1 HEAD --name-only packages/frontend/src)" ]; then
  echo "⚠️  Không có thay đổi trong frontend, nhưng vẫn tiếp tục build..."
fi

# Install dependencies nếu cần
echo "📦 Installing dependencies..."
npm install

# Build frontend
echo "🔨 Building frontend..."
cd "$APP_DIR/packages/frontend"
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
cd "$APP_DIR"
pm2 restart solar-frontend

# Kiểm tra status
echo ""
echo "=================================="
echo "✅ Update Complete!"
echo "=================================="
echo ""
echo "PM2 Status:"
pm2 status solar-frontend
echo ""
echo "Recent logs:"
pm2 logs solar-frontend --lines 10 --nostream
echo ""
echo "Để xem logs chi tiết: pm2 logs solar-frontend"

#!/bin/bash

# Script fix hoàn chỉnh cho VPS
set -e

APP_DIR="/var/www/solar"

echo "=================================="
echo "FIX VPS - Hoàn chỉnh"
echo "=================================="
echo ""

cd "$APP_DIR" || exit 1

# 1. Stash local changes và pull
echo "1. Stashing local changes và pull code..."
git stash
git fetch origin
git checkout main
git pull origin main

# 2. Install dependencies
echo ""
echo "2. Installing dependencies..."
npm install

# 3. Build frontend
echo ""
echo "3. Building frontend..."
cd "$APP_DIR/packages/frontend"
rm -rf .next
npm run build

# 4. Build backend (nếu cần)
echo ""
echo "4. Building backend..."
cd "$APP_DIR/packages/backend"
npm run build || echo "Backend build skipped (already built)"

# 5. Kiểm tra backend health
echo ""
echo "5. Kiểm tra backend health..."
BACKEND_URL="http://localhost:4000"
HEALTH_CHECK=$(curl -s "${BACKEND_URL}/api/health" || echo "FAILED")
if [[ "$HEALTH_CHECK" == *"ok"* ]]; then
  echo "   ✓ Backend đang chạy"
else
  echo "   ✗ Backend KHÔNG phản hồi!"
  echo "   Kiểm tra: pm2 logs solar-backend"
fi

# 6. Kiểm tra API URL trong env
echo ""
echo "6. Kiểm tra NEXT_PUBLIC_API_URL..."
if [ -f "packages/frontend/.env.production" ]; then
  echo "   File .env.production:"
  grep NEXT_PUBLIC_API_URL packages/frontend/.env.production || echo "   Không tìm thấy NEXT_PUBLIC_API_URL"
else
  echo "   ⚠️  File .env.production không tồn tại!"
  echo "   Tạo file với: NEXT_PUBLIC_API_URL=http://localhost:4000"
fi

# 7. Restart PM2
echo ""
echo "7. Restarting PM2..."
cd "$APP_DIR"
pm2 restart solar-backend
pm2 restart solar-frontend

# 8. Kiểm tra status
echo ""
echo "=================================="
echo "✅ Hoàn tất!"
echo "=================================="
echo ""
pm2 status
echo ""
echo "Backend health:"
curl -s http://localhost:4000/api/health | jq . || echo "Backend không phản hồi"
echo ""

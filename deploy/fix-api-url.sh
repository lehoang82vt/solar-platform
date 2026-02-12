#!/bin/bash

# Script fix API URL cho production
set -e

APP_DIR="/var/www/solar"

echo "=================================="
echo "Fix API URL Configuration"
echo "=================================="
echo ""

cd "$APP_DIR" || exit 1

# Kiểm tra file .env.production
ENV_FILE="packages/frontend/.env.production"

if [ -f "$ENV_FILE" ]; then
  echo "File .env.production hiện tại:"
  cat "$ENV_FILE"
  echo ""
fi

# Tạo/cập nhật .env.production
echo "Tạo/cập nhật .env.production..."
cat > "$ENV_FILE" << EOF
# ============================================
# SOLAR FRONTEND - PRODUCTION ENVIRONMENT
# ============================================

# Backend API URL
# Sử dụng relative path để frontend gọi qua cùng domain
# Nginx/Caddy sẽ proxy /api/* đến backend
NEXT_PUBLIC_API_URL=

# Hoặc nếu backend expose ra ngoài, dùng:
# NEXT_PUBLIC_API_URL=https://api.solar.tinhoclehoang.com

# Application Settings
NEXT_PUBLIC_APP_NAME=Solar-GPT
NEXT_PUBLIC_ENV=production
EOF

echo "✅ Đã cập nhật .env.production"
echo ""
echo "Nội dung mới:"
cat "$ENV_FILE"
echo ""

# Rebuild frontend
echo "Rebuilding frontend..."
cd packages/frontend
rm -rf .next
npm run build

echo ""
echo "=================================="
echo "✅ Hoàn tất!"
echo "=================================="
echo ""
echo "Lưu ý:"
echo "1. Nếu dùng relative path (NEXT_PUBLIC_API_URL=), cần setup reverse proxy"
echo "2. Nginx/Caddy phải proxy /api/* đến http://localhost:4000/api/*"
echo "3. Restart frontend: pm2 restart solar-frontend"

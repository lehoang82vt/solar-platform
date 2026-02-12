#!/bin/bash

# Script kiểm tra backend và database
# Chạy: bash deploy/check-backend.sh

echo "=================================="
echo "Kiểm tra Backend và Database"
echo "=================================="
echo ""

# Kiểm tra PM2
echo "1. Kiểm tra PM2 processes:"
pm2 status
echo ""

# Kiểm tra backend logs
echo "2. Backend logs (10 dòng cuối):"
pm2 logs solar-backend --lines 10 --nostream || echo "Không tìm thấy solar-backend"
echo ""

# Kiểm tra backend health
echo "3. Kiểm tra backend health endpoint:"
BACKEND_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
curl -s "${BACKEND_URL}/api/health" | jq . || echo "Backend không phản hồi"
echo ""

# Kiểm tra database connection
echo "4. Kiểm tra database connection:"
cd /var/www/solar/packages/backend
node -e "
const { getDatabasePool } = require('./dist/config/database');
const pool = getDatabasePool();
if (pool) {
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.log('Database error:', err.message);
      process.exit(1);
    } else {
      console.log('Database connected:', res.rows[0]);
      process.exit(0);
    }
  });
} else {
  console.log('Database pool not initialized');
  process.exit(1);
}
" || echo "Không thể kiểm tra database"
echo ""

# Kiểm tra users trong database
echo "5. Kiểm tra users trong database:"
cd /var/www/solar/packages/backend
node -e "
const { getDatabasePool } = require('./dist/config/database');
const pool = getDatabasePool();
if (pool) {
  pool.query('SELECT email, role, status FROM users LIMIT 5', (err, res) => {
    if (err) {
      console.log('Error:', err.message);
    } else {
      console.log('Users:', JSON.stringify(res.rows, null, 2));
    }
    process.exit(0);
  });
} else {
  console.log('Database pool not initialized');
  process.exit(1);
}
" || echo "Không thể query users"
echo ""

echo "=================================="
echo "Hoàn tất kiểm tra"
echo "=================================="

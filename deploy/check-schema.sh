#!/bin/bash

# Script kiểm tra database schema thực tế
# Chạy: bash deploy/check-schema.sh

echo "=================================="
echo "Kiểm tra Database Schema"
echo "=================================="
echo ""

cd /var/www/solar/packages/backend || exit 1

# Kiểm tra schema quotes
echo "1. Kiểm tra bảng quotes:"
node -e "
const { getDatabasePool } = require('./dist/config/database');
const pool = getDatabasePool();
if (pool) {
  pool.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'quotes' ORDER BY ordinal_position\", (err, res) => {
    if (err) {
      console.log('Error:', err.message);
      process.exit(1);
    } else {
      console.log('Columns trong bảng quotes:');
      res.rows.forEach(r => console.log('  -', r.column_name, '(', r.data_type, ')'));
      process.exit(0);
    }
  });
} else {
  console.log('Database pool not initialized');
  process.exit(1);
}
" || echo "Không thể kiểm tra quotes"

echo ""
echo "2. Kiểm tra bảng handovers:"
node -e "
const { getDatabasePool } = require('./dist/config/database');
const pool = getDatabasePool();
if (pool) {
  pool.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'handovers' ORDER BY ordinal_position\", (err, res) => {
    if (err) {
      console.log('Error:', err.message);
      process.exit(1);
    } else {
      console.log('Columns trong bảng handovers:');
      res.rows.forEach(r => console.log('  -', r.column_name, '(', r.data_type, ')'));
      process.exit(0);
    }
  });
} else {
  console.log('Database pool not initialized');
  process.exit(1);
}
" || echo "Không thể kiểm tra handovers"

echo ""
echo "3. Kiểm tra bảng contracts:"
node -e "
const { getDatabasePool } = require('./dist/config/database');
const pool = getDatabasePool();
if (pool) {
  pool.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contracts' ORDER BY ordinal_position\", (err, res) => {
    if (err) {
      console.log('Error:', err.message);
      process.exit(1);
    } else {
      console.log('Columns trong bảng contracts:');
      res.rows.forEach(r => console.log('  -', r.column_name, '(', r.data_type, ')'));
      process.exit(0);
    }
  });
} else {
  console.log('Database pool not initialized');
  process.exit(1);
}
" || echo "Không thể kiểm tra contracts"

echo ""
echo "=================================="
echo "Hoàn tất kiểm tra"
echo "=================================="

#!/bin/bash

# Script test API đơn giản
# Chạy sau khi rebuild backend

echo "Testing API endpoints..."

# Test health
echo "1. Testing /api/health..."
curl -s http://localhost:4000/api/health | jq . || echo "FAILED"

# Test với token (cần login trước)
echo ""
echo "2. Testing /api/sales/leads (cần token)..."
echo "   (Skip - cần login trước)"

echo ""
echo "Done. Check PM2 logs for errors: pm2 logs solar-backend"

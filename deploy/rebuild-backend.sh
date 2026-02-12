#!/bin/bash

# Script rebuild backend đảm bảo dist/ được tạo đúng

set -e

cd /var/www/solar/packages/backend

echo "Cleaning old build..."
rm -rf dist

echo "Building backend..."
npm run build

echo "Checking build output..."
if [ ! -f "dist/server.js" ]; then
    echo "ERROR: dist/server.js not found!"
    echo "Checking for alternative locations..."
    find /var/www/solar -name "server.js" -not -path "*/node_modules/*" 2>/dev/null || true
    exit 1
fi

echo "Build successful! Files in dist/:"
ls -la dist/ | head -10

echo ""
echo "Restarting PM2..."
cd /var/www/solar
pm2 restart solar-backend

echo "Done!"

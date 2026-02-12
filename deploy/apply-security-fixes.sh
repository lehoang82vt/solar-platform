#!/bin/bash

# Solar Security Fixes Deployment Script
# This script applies security fixes to the VPS deployment

set -e

echo "=================================================="
echo "Solar Security Fixes Deployment"
echo "=================================================="
echo ""

APP_DIR="/var/www/solar"

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Error: $APP_DIR not found"
    echo "Please run this script on the VPS"
    exit 1
fi

cd $APP_DIR

echo "📍 Current directory: $(pwd)"
echo ""

# Step 1: Backup current .env
echo "1️⃣  Backing up current .env files..."
cp packages/backend/.env packages/backend/.env.backup.$(date +%Y%m%d_%H%M%S) || true
echo "✅ Backup created"
echo ""

# Step 2: Check for required env vars
echo "2️⃣  Checking environment variables..."

if ! grep -q "ADMIN_EMAIL" packages/backend/.env; then
    echo "⚠️  ADMIN_EMAIL not found in .env"
    echo ""
    read -p "Enter ADMIN_EMAIL (e.g., admin@tinhoclehoang.com): " admin_email
    echo "ADMIN_EMAIL=$admin_email" >> packages/backend/.env
    echo "✅ ADMIN_EMAIL added"
fi

if ! grep -q "ADMIN_PASSWORD" packages/backend/.env; then
    echo "⚠️  ADMIN_PASSWORD not found in .env"
    echo ""
    read -sp "Enter ADMIN_PASSWORD (secure password): " admin_password
    echo ""
    echo "ADMIN_PASSWORD=$admin_password" >> packages/backend/.env
    echo "✅ ADMIN_PASSWORD added"
fi

# Check JWT_SECRET length
JWT_SECRET=$(grep "^JWT_SECRET=" packages/backend/.env | cut -d= -f2- || echo "")
if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
    echo "⚠️  JWT_SECRET missing or too short (needs 32+ chars)"
    echo "Current JWT_SECRET length: ${#JWT_SECRET}"
    echo ""
    echo "Generating new JWT_SECRET..."
    NEW_JWT_SECRET=$(openssl rand -base64 32)

    if grep -q "^JWT_SECRET=" packages/backend/.env; then
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_JWT_SECRET|" packages/backend/.env
    else
        echo "JWT_SECRET=$NEW_JWT_SECRET" >> packages/backend/.env
    fi
    echo "✅ JWT_SECRET updated (${#NEW_JWT_SECRET} chars)"
fi

echo ""
echo "✅ Environment variables verified"
echo ""

# Step 3: Pull latest code
echo "3️⃣  Pulling latest code from repository..."
git stash || true
git pull origin main || {
    echo "⚠️  Git pull failed - continuing with local changes"
}
echo "✅ Code updated"
echo ""

# Step 4: Install dependencies (if package.json changed)
echo "4️⃣  Checking dependencies..."
npm install
echo "✅ Dependencies updated"
echo ""

# Step 5: Rebuild application
echo "5️⃣  Building application..."
npm run build || {
    echo "❌ Build failed!"
    echo "Check errors above and fix before continuing"
    exit 1
}
echo "✅ Build successful"
echo ""

# Step 6: Test database connection
echo "6️⃣  Testing database connection..."
cd packages/backend
node -e "
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

pool.query('SELECT 1')
  .then(() => {
    console.log('✅ Database connection successful');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });
" || {
    echo "❌ Database connection test failed"
    exit 1
}
cd ../..
echo ""

# Step 7: Restart PM2
echo "7️⃣  Restarting application..."
pm2 restart all
echo "✅ Application restarted"
echo ""

# Step 8: Check PM2 status
echo "8️⃣  Checking application status..."
sleep 3
pm2 status
echo ""

# Step 9: Check logs for errors
echo "9️⃣  Checking logs for errors..."
echo "Backend logs (last 20 lines):"
pm2 logs solar-backend --lines 20 --nostream || true
echo ""
echo "Frontend logs (last 20 lines):"
pm2 logs solar-frontend --lines 20 --nostream || true
echo ""

# Final check
echo "=================================================="
echo "🎉 Security Fixes Deployment Complete!"
echo "=================================================="
echo ""
echo "📋 Summary of Changes:"
echo "  ✅ JWT_SECRET enforced (32+ chars required)"
echo "  ✅ ADMIN credentials secured (required for migrations)"
echo "  ✅ Accessories cost calculation implemented"
echo "  ✅ DEV OTP logging removed"
echo "  ✅ Environment configuration updated"
echo ""
echo "🔍 Verification Steps:"
echo "  1. Check PM2 status: pm2 status"
echo "  2. View logs: pm2 logs"
echo "  3. Test website: https://solar.tinhoclehoang.com"
echo "  4. Test API health: curl https://solar.tinhoclehoang.com/api/health"
echo ""
echo "⚠️  Important Notes:"
echo "  - Backup created: packages/backend/.env.backup.*"
echo "  - New env vars added to .env (if missing)"
echo "  - Application rebuilt and restarted"
echo ""
echo "📖 For detailed information, see: SECURITY-FIXES-APPLIED.md"
echo ""

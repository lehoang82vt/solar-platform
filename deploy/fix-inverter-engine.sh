#!/bin/bash

# Fix Inverter Engine - Deployment Script
# This script deploys the inverter engine bug fixes to VPS

set -e

echo "=================================="
echo "Fix Inverter Engine - Deployment"
echo "=================================="
echo ""

# Detect project directory
if [ -d "/var/www/solar" ]; then
    APP_DIR="/var/www/solar"
elif [ -d "$HOME/solar-platform" ]; then
    APP_DIR="$HOME/solar-platform"
else
    echo "❌ Project directory not found!"
    echo "Please run this script from the project root or set APP_DIR"
    exit 1
fi

cd "$APP_DIR"

echo "📍 Current directory: $(pwd)"
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "🌿 Current branch: $CURRENT_BRANCH"
echo ""

# Checkout the fix branch if not already on it
if [ "$CURRENT_BRANCH" != "cursor/logic-t-ng-th-ch-inverter-9f4e" ]; then
    echo "🔄 Switching to fix branch..."
    git fetch origin cursor/logic-t-ng-th-ch-inverter-9f4e
    git checkout cursor/logic-t-ng-th-ch-inverter-9f4e
    echo "✅ Switched to cursor/logic-t-ng-th-ch-inverter-9f4e"
    echo ""
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin cursor/logic-t-ng-th-ch-inverter-9f4e
echo "✅ Code updated"
echo ""

# Install dependencies (if needed)
if [ -f "package.json" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
fi

# Build packages (if needed)
if [ -f "package.json" ] && grep -q '"build"' package.json; then
    echo "🔨 Building packages..."
    npm run build
    echo "✅ Build complete"
    echo ""
fi

# Run database migration
echo "🗄️  Running database migration 057_inverter_mppt_specs..."
cd "$APP_DIR/packages/backend"

# Check if migration file exists
if [ ! -f "migrations/057_inverter_mppt_specs.sql" ]; then
    echo "❌ Migration file not found!"
    exit 1
fi

# Run migration
npm run migrate
echo "✅ Migration complete"
echo ""

# Verify migration
echo "🔍 Verifying migration..."
cd "$APP_DIR"
if command -v docker-compose &> /dev/null; then
    echo "Checking if columns were added..."
    docker compose exec -T postgres psql -U postgres -d solar -c "
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'catalog_inverters' 
        AND column_name IN ('mppt_min_voltage', 'mppt_max_voltage', 'start_voltage', 'mppt_max_current')
        ORDER BY column_name;
    " || echo "⚠️  Could not verify (docker-compose may not be running)"
fi
echo ""

# Restart services if PM2 is used
if command -v pm2 &> /dev/null && [ -f "ecosystem.config.js" ]; then
    echo "🔄 Restarting PM2 processes..."
    pm2 restart all || pm2 reload all
    echo "✅ Services restarted"
    echo ""
fi

echo "=================================="
echo "✅ Deployment Complete!"
echo "=================================="
echo ""
echo "Summary of fixes:"
echo "  ✓ Bug 1: Fixed checkMpptCurrent (current calculation)"
echo "  ✓ Bug 2: Fixed calculateStringing (try fewer strings first)"
echo "  ✓ Bug 3: Added per-inverter MPPT specs to DB"
echo ""
echo "Next steps:"
echo "  1. Update MPPT specs for each inverter in catalog_inverters table"
echo "     (if different from defaults: 150-850V, 180V start, 30A max)"
echo "  2. Test inverter recommendations with JA Solar JAM72D42-610/LB × 7 panels"
echo ""

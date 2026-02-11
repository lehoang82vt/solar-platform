#!/bin/bash

# Solar Deployment Script
# This script handles deployment to VPS

set -e

APP_DIR="/var/www/solar"
REPO_URL="https://github.com/yourusername/solar.git"  # Update this with your actual repo URL

echo "=================================="
echo "Solar Deployment Script"
echo "=================================="
echo ""

# Check if this is first deployment
if [ ! -d "$APP_DIR/.git" ]; then
    echo "📦 First deployment - cloning repository..."

    # Clone repository
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
else
    echo "🔄 Updating existing deployment..."
    cd $APP_DIR

    # Stash any local changes
    git stash

    # Pull latest changes
    git pull origin main
fi

# Create logs directory
mkdir -p $APP_DIR/logs

# Check if .env exists
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚠️  .env file not found!"
    echo "Please create .env file with your configuration"
    echo "You can copy from .env.example:"
    echo "  cp .env.example .env"
    echo ""
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building packages..."
npm run build

# Run database migrations
echo "🗄️  Running database migrations..."
cd $APP_DIR/packages/backend
npm run migrate

echo "🔄 Restarting PM2 processes..."
cd $APP_DIR

# Stop existing processes (if any)
pm2 delete all || true

# Start new processes
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

echo ""
echo "=================================="
echo "✅ Deployment Complete!"
echo "=================================="
echo ""
echo "Application status:"
pm2 status
echo ""
echo "View logs:"
echo "  pm2 logs"
echo ""
echo "Monitor:"
echo "  pm2 monit"
echo ""

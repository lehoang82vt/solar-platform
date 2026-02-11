#!/bin/bash

# Solar VPS Setup Script
# Run this script on your VPS to install all required dependencies

set -e

echo "=================================="
echo "Solar VPS Environment Setup"
echo "=================================="
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo "✅ Node.js version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

echo "✅ PostgreSQL installed"

# Install Redis
echo "📦 Installing Redis..."
sudo apt install -y redis-server

# Configure Redis
sudo sed -i 's/supervised no/supervised systemd/g' /etc/redis/redis.conf

# Start Redis
sudo systemctl restart redis.service
sudo systemctl enable redis

echo "✅ Redis installed"

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "✅ Nginx installed"

# Install Certbot for SSL
echo "📦 Installing Certbot for Let's Encrypt SSL..."
sudo apt install -y certbot python3-certbot-nginx

echo "✅ Certbot installed"

# Install PM2
echo "📦 Installing PM2 globally..."
sudo npm install -g pm2

# Setup PM2 startup
sudo pm2 startup systemd -u $USER --hp /home/$USER

echo "✅ PM2 installed"

# Install Git
echo "📦 Installing Git..."
sudo apt install -y git

echo "✅ Git installed"

# Create app directory
echo "📁 Creating app directory..."
sudo mkdir -p /var/www/solar
sudo chown -R $USER:$USER /var/www/solar

echo ""
echo "=================================="
echo "✅ VPS Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Configure PostgreSQL database"
echo "2. Clone your repository"
echo "3. Configure environment variables"
echo "4. Deploy the application"
echo ""

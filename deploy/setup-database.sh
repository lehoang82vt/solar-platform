#!/bin/bash

# PostgreSQL Database Setup Script

set -e

echo "=================================="
echo "PostgreSQL Database Setup"
echo "=================================="
echo ""

# Database credentials
DB_NAME="solar_production"
DB_USER="solar_user"

# Generate random password
DB_PASSWORD=$(openssl rand -base64 32)

echo "Creating PostgreSQL database and user..."

# Create database and user
sudo -u postgres psql <<EOF
-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to database and grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;

EOF

echo ""
echo "=================================="
echo "✅ Database Setup Complete!"
echo "=================================="
echo ""
echo "Database credentials (save these!):"
echo "-----------------------------------"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Password: $DB_PASSWORD"
echo "Host: localhost"
echo "Port: 5432"
echo ""
echo "Add these to your .env file:"
echo "-----------------------------------"
echo "POSTGRES_DB=$DB_NAME"
echo "POSTGRES_USER=$DB_USER"
echo "POSTGRES_PASSWORD=$DB_PASSWORD"
echo "POSTGRES_HOST=localhost"
echo "POSTGRES_PORT=5432"
echo ""

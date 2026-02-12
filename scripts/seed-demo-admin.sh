#!/bin/bash
# SEED DEMO ADMIN USER using curl + Node.js crypto

set -e

DEMO_EMAIL="admin@demo.local"
DEMO_PASSWORD="demo123"
API="http://localhost:3000/api"

echo "=== SEEDING DEMO ADMIN USER ==="
echo ""

# Helper function to compute SHA256 hash (password hashing)
hash_password() {
    echo -n "$1" | openssl dgst -sha256 -hex | sed 's/^.*= //'
}

echo "Demo Email: $DEMO_EMAIL"
echo "Demo Password: $DEMO_PASSWORD"
echo ""

# Get password hash
PASSWORD_HASH=$(hash_password "$DEMO_PASSWORD")
echo "Password Hash: $PASSWORD_HASH"

# Get organization ID from database using psql or direct query
echo ""
echo "Getting organization ID..."

# Try using Node.js to query the database
result=$(node -e "
const pg = require('pg');
const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'solar',
  user: 'postgres',
  password: 'postgres'
});

client.connect().then(() => {
  return client.query('SELECT id FROM organizations LIMIT 1');
}).then(res => {
  if (res.rows.length > 0) {
    console.log(res.rows[0].id);
  }
  client.end();
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
" 2>/dev/null) || {
  echo "✗ Could not connect to database via Node.js pg"
  exit 1
}

ORG_ID="$result"
echo "Organization ID: $ORG_ID"

if [ -z "$ORG_ID" ]; then
  echo "✗ No organization found"
  exit 1
fi

# Check if user already exists
echo ""
echo "Checking if user already exists..."

exists=$(node -e "
const pg = require('pg');
const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'solar',
  user: 'postgres',
  password: 'postgres'
});

client.connect().then(() => {
  return client.query('SELECT id FROM users WHERE email = \$1', ['$DEMO_EMAIL']);
}).then(res => {
  console.log(res.rows.length > 0 ? '1' : '0');
  client.end();
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
" 2>/dev/null) || {
  echo "✗ Could not query users table"
  exit 1
}

if [ "$exists" = "1" ]; then
  echo "✓ Demo admin already exists: $DEMO_EMAIL"
else
  echo "Creating demo admin user..."

  node -e "
const pg = require('pg');
const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'solar',
  user: 'postgres',
  password: 'postgres'
});

client.connect().then(() => {
  return client.query(
    'INSERT INTO users (organization_id, email, password_hash, full_name, role, status) VALUES (\$1, \$2, \$3, \$4, \$5, \$6) ON CONFLICT (email) DO NOTHING',
    ['$ORG_ID', '$DEMO_EMAIL', '$PASSWORD_HASH', 'Demo Admin', 'ADMIN', 'ACTIVE']
  );
}).then(res => {
  console.log('✓ Demo admin created');
  client.end();
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
" 2>/dev/null || {
  echo "✗ Could not insert user"
  exit 1
}
fi

echo ""
echo "=== DEMO LOGIN READY ==="
echo "Email: $DEMO_EMAIL"
echo "Password: $DEMO_PASSWORD"
echo ""

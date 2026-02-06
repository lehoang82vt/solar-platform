#!/bin/bash

# Solar AI Compliance Check Script
# Verifies project structure and build health

set -e

echo "=== Solar AI Compliance Check ==="
echo ""

# Check required files
echo "[1] Checking required root files..."
required_files=(
  "package.json"
  "turbo.json"
  "tsconfig.base.json"
  ".eslintrc.js"
  ".prettierrc"
  "docker-compose.yml"
  ".env.example"
)

for file in "${required_files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file MISSING"
    exit 1
  fi
done

echo ""
echo "[2] Checking packages/shared structure..."
shared_files=(
  "packages/shared/package.json"
  "packages/shared/tsconfig.json"
  "packages/shared/src/index.ts"
)

for file in "${shared_files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file MISSING"
    exit 1
  fi
done

echo ""
echo "[3] Checking packages/backend structure..."
backend_files=(
  "packages/backend/package.json"
  "packages/backend/tsconfig.json"
  "packages/backend/jest.config.ts"
  "packages/backend/src/app.ts"
  "packages/backend/src/server.ts"
  "packages/backend/src/config/env.ts"
  "packages/backend/src/config/database.ts"
)

for file in "${backend_files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file MISSING"
    exit 1
  fi
done

echo ""
echo "=== All compliance checks PASSED ==="

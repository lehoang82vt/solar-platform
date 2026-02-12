#!/bin/bash

# UFW Rules for Solar Application
# Script này thêm rules cho phép Caddy container truy cập Solar services

set -e

echo "=================================="
echo "UFW Rules Setup for Solar"
echo "=================================="
echo ""

# Tìm network management-net của Caddy
NET=$(docker network ls --format '{{.Name}}' | awk '/_management-net$/ {print; exit}')

if [ -z "$NET" ]; then
  echo "❌ Không tìm thấy network *_management-net"
  echo ""
  echo "Danh sách networks hiện tại:"
  docker network ls
  echo ""
  echo "💡 Hãy đảm bảo Caddy stack đang chạy:"
  echo "   cd ~/hybrid-stack && docker compose up -d"
  exit 1
fi

echo "✅ Found management-net: $NET"

# Lấy subnet của network
SUBNET=$(docker network inspect "$NET" -f '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true)

if [ -z "$SUBNET" ]; then
  echo "❌ Không lấy được Subnet từ $NET"
  exit 1
fi

echo "✅ Subnet: $SUBNET"
echo ""

# Thêm UFW rules
echo "🔧 Adding UFW rules..."

# Solar Backend (port 4000)
sudo ufw allow from "$SUBNET" to any port 4000 proto tcp comment 'Caddy -> Solar Backend'

# Solar Frontend (port 3001)
sudo ufw allow from "$SUBNET" to any port 3001 proto tcp comment 'Caddy -> Solar Frontend'

# Reload UFW
sudo ufw reload

echo ""
echo "=================================="
echo "✅ UFW Rules Added Successfully!"
echo "=================================="
echo ""
echo "Current UFW status:"
sudo ufw status numbered | grep -E "4000|3001" || echo "No rules found (might need sudo)"
echo ""
echo "📝 Added rules:"
echo "   - Allow $SUBNET -> port 4000 (Solar Backend)"
echo "   - Allow $SUBNET -> port 3001 (Solar Frontend)"
echo ""

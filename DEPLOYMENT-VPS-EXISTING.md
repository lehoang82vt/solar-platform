# 🚀 Hướng Dẫn Deploy Solar lên VPS Đã Có Sẵn Dịch Vụ

## 📋 Thông Tin VPS

- **IP**: 103.186.65.23
- **Domain**: solar.tinhoclehoang.com
- **User**: lehoang
- **OS**: Ubuntu/Debian

## ⚙️ Dịch Vụ Đang Chạy (Không Được Động Vào)

- ✅ **Caddy** (port 80, 443) - Reverse proxy
- ✅ **AdGuard Home** (port 3000, 53) - DNS & Ad blocking
- ✅ **WireGuard UI** (port 5000) - VPN management
- ✅ **MeshCentral** (HTTPS backend) - Remote management
- ✅ **RustDesk** (ports 21115-21119) - Remote desktop
- ✅ **PostgreSQL** (port 5432) - Database server
- ✅ **Redis** (port 6379) - Cache server
- ✅ **UFW** - Firewall enabled

## 🔧 Thay Đổi So Với Setup Mới

### 1. **Backend Port**: 4000 (thay vì 3000)
   - Tránh xung đột với AdGuard Home (port 3000)

### 2. **Không cài Nginx**
   - Dùng luôn **Caddy** đang có
   - Chỉ cần thêm config block cho Solar

### 3. **PostgreSQL & Redis**
   - Dùng chung services đang chạy
   - Tạo database riêng cho Solar

### 4. **UFW Rules**
   - Thêm rules cho Solar ports (4000, 3001)
   - Cho phép Caddy container truy cập

---

## 🎯 Các Bước Deploy

### ✅ Bước 1: Chuẩn Bị DNS

Thêm bản ghi A tại Cloudflare (Grey cloud - DNS only):

```
Type: A
Name: solar
Content: 103.186.65.23
Proxy: OFF (Grey cloud)
```

Kết quả: `solar.tinhoclehoang.com` → `103.186.65.23`

---

### ✅ Bước 2: Upload Code lên VPS

**Cách 1: Từ Git Repository (Khuyến nghị)**

Trên VPS:

```bash
# SSH vào VPS
ssh lehoang@103.186.65.23

# Clone repository
cd /var/www
git clone https://github.com/your-username/solar.git
cd solar
```

**Cách 2: Upload từ Windows**

Trên Windows PowerShell:

```powershell
# Nén project (loại trừ node_modules)
cd D:\Soft\VPS\Solar
tar --exclude='node_modules' --exclude='.git' --exclude='*.log' -czf solar.tar.gz .

# Upload lên VPS
scp solar.tar.gz lehoang@103.186.65.23:/home/lehoang/

# Trên VPS
ssh lehoang@103.186.65.23
sudo mkdir -p /var/www/solar
sudo chown -R lehoang:lehoang /var/www/solar
tar -xzf solar.tar.gz -C /var/www/solar
cd /var/www/solar
```

---

### ✅ Bước 3: Thiết Lập Database

Upload và chạy script:

```bash
# Upload script
scp deploy/setup-solar-database.sh lehoang@103.186.65.23:/tmp/

# Trên VPS
ssh lehoang@103.186.65.23
chmod +x /tmp/setup-solar-database.sh
/tmp/setup-solar-database.sh
```

**⚠️ QUAN TRỌNG**: Script sẽ hiển thị thông tin database. **LƯU LẠI NGAY!**

```
Database: solar_production
User: solar_user
Password: <random_password_here>
Host: localhost
Port: 5432
```

---

### ✅ Bước 4: Cấu Hình Environment

```bash
cd /var/www/solar

# Tạo .env từ template
cp .env.example .env

# Chỉnh sửa .env
nano .env
```

Nội dung `.env`:

```env
# Database (từ Bước 3)
POSTGRES_DB=solar_production
POSTGRES_USER=solar_user
POSTGRES_PASSWORD=<password_from_step_3>
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis (dùng chung)
REDIS_HOST=localhost
REDIS_PORT=6379

# Backend (PORT 4000 - QUAN TRỌNG!)
NODE_ENV=production
PORT=4000

# JWT Secret (tạo random)
JWT_SECRET=<your_random_secret>

# Frontend
NEXT_PUBLIC_API_URL=https://solar.tinhoclehoang.com/api
```

Tạo JWT_SECRET:

```bash
openssl rand -base64 32
```

---

### ✅ Bước 5: Build Application

```bash
cd /var/www/solar

# Install dependencies
npm install

# Build all packages
npm run build

# Run database migrations
cd packages/backend
npm run migrate

# Quay về root
cd /var/www/solar
```

---

### ✅ Bước 6: Cấu Hình Caddy

```bash
# Backup Caddyfile hiện tại
sudo cp ~/hybrid-stack/Caddyfile ~/hybrid-stack/Caddyfile.backup

# Chỉnh sửa Caddyfile
nano ~/hybrid-stack/Caddyfile
```

Thêm block này vào **cuối file** Caddyfile (sau các domain khác):

```caddy
# Solar - VPS Management Platform
solar.tinhoclehoang.com {
    # API routes - proxy to backend (port 4000)
    route /api* {
        reverse_proxy host.docker.internal:4000 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Frontend - proxy to Next.js (port 3001)
    route {
        reverse_proxy host.docker.internal:3001 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
    }

    # Max upload size
    request_body {
        max_size 100MB
    }
}
```

**Reload Caddy:**

```bash
cd ~/hybrid-stack
docker compose restart caddy

# Kiểm tra logs
docker compose logs --tail=50 caddy
```

---

### ✅ Bước 7: Thêm UFW Rules

Upload và chạy script:

```bash
# Upload script
scp deploy/ufw-solar-rules.sh lehoang@103.186.65.23:/tmp/

# Trên VPS
chmod +x /tmp/ufw-solar-rules.sh
/tmp/ufw-solar-rules.sh
```

Script sẽ tự động:
- Tìm subnet của Caddy container
- Thêm rules cho port 4000 (Backend)
- Thêm rules cho port 3001 (Frontend)

---

### ✅ Bước 8: Khởi Động Solar với PM2

```bash
cd /var/www/solar

# Tạo thư mục logs
mkdir -p logs

# Start với PM2
pm2 start ecosystem.config.js

# Lưu danh sách process
pm2 save

# Kiểm tra status
pm2 status
```

Kết quả mong đợi:

```
┌────┬────────────────────┬─────────┬─────────┬──────────┐
│ id │ name               │ status  │ restart │ uptime   │
├────┼────────────────────┼─────────┼─────────┼──────────┤
│ 0  │ solar-backend      │ online  │ 0       │ 2s       │
│ 1  │ solar-frontend     │ online  │ 0       │ 2s       │
└────┴────────────────────┴─────────┴─────────┴──────────┘
```

Xem logs:

```bash
pm2 logs
pm2 logs solar-backend
pm2 logs solar-frontend
```

---

### ✅ Bước 9: Kiểm Tra Deployment

#### 1. **Kiểm tra services chạy đúng port**

```bash
# Backend phải chạy port 4000
sudo ss -tlnp | grep :4000

# Frontend phải chạy port 3001
sudo ss -tlnp | grep :3001

# Kết quả mong đợi:
# LISTEN 0  511  *:4000  *:*  users:(("node",pid=12345,...))
# LISTEN 0  511  *:3001  *:*  users:(("node",pid=12346,...))
```

#### 2. **Test từ localhost**

```bash
# Test Backend
curl http://localhost:4000/api/health

# Test Frontend
curl -I http://localhost:3001
```

#### 3. **Kiểm tra Caddy logs**

```bash
cd ~/hybrid-stack
docker compose logs --tail=100 caddy | grep solar
```

#### 4. **Test từ browser**

Mở trình duyệt:

- **Frontend**: https://solar.tinhoclehoang.com
- **Backend API**: https://solar.tinhoclehoang.com/api

Caddy sẽ tự động xin SSL certificate từ Let's Encrypt.

---

## 🔄 Deploy Lại (Update Code)

Khi có code mới:

```bash
cd /var/www/solar

# Pull code mới (nếu dùng Git)
git pull origin main

# Hoặc upload file mới từ Windows

# Install dependencies (nếu có thay đổi package.json)
npm install

# Build lại
npm run build

# Run migrations (nếu có DB changes)
cd packages/backend
npm run migrate
cd ../..

# Restart PM2
pm2 restart all

# Kiểm tra logs
pm2 logs
```

---

## 📊 Quản Lý

### PM2 Commands

```bash
pm2 list                      # Danh sách processes
pm2 logs                      # Xem tất cả logs
pm2 logs solar-backend        # Logs backend
pm2 logs solar-frontend       # Logs frontend
pm2 monit                     # Monitor real-time
pm2 restart solar-backend     # Restart backend
pm2 restart solar-frontend    # Restart frontend
pm2 restart all               # Restart tất cả
pm2 stop all                  # Stop tất cả
pm2 delete solar-backend      # Xóa process
```

### Caddy Commands

```bash
cd ~/hybrid-stack

# Xem logs Caddy
docker compose logs --tail=100 caddy

# Restart Caddy
docker compose restart caddy

# Check config
docker exec hybrid-stack-caddy-1 caddy validate --config /etc/caddy/Caddyfile
```

### Database Commands

```bash
# Connect to Solar database
psql -U solar_user -d solar_production -h localhost

# Trong psql:
\dt              # List tables
\d table_name    # Describe table
SELECT * FROM users LIMIT 10;
\q               # Exit
```

---

## 🐛 Troubleshooting

### 1. **Backend không start / Port conflict**

```bash
# Kiểm tra port 4000 có bị dùng không
sudo ss -tlnp | grep :4000

# Nếu bị conflict, kill process
sudo kill <PID>

# Restart PM2
pm2 restart solar-backend
```

### 2. **Frontend không load / Next.js error**

```bash
# Xem logs chi tiết
pm2 logs solar-frontend --lines 200

# Thường do thiếu build
cd /var/www/solar/packages/frontend
npm run build

# Restart
pm2 restart solar-frontend
```

### 3. **Caddy không proxy được**

```bash
# Kiểm tra Caddy có thấy host.docker.internal không
docker exec hybrid-stack-caddy-1 ping -c 2 host.docker.internal

# Kiểm tra Caddy có connect được port 4000, 3001
docker exec hybrid-stack-caddy-1 wget -O- --timeout=3 http://host.docker.internal:4000/api/health
docker exec hybrid-stack-caddy-1 wget -O- --timeout=3 http://host.docker.internal:3001

# Xem Caddy logs
cd ~/hybrid-stack
docker compose logs --tail=200 caddy | grep -i error
```

### 4. **SSL certificate không tự động tạo**

```bash
# Xem Caddy logs để biết lỗi gì
cd ~/hybrid-stack
docker compose logs caddy | grep -i "solar.tinhoclehoang.com"

# Thường do:
# - DNS chưa trỏ đúng (kiểm tra: dig solar.tinhoclehoang.com)
# - Port 80/443 bị chặn (kiểm tra UFW)
# - Email trong CADDY_EMAIL không hợp lệ
```

### 5. **Database connection error**

```bash
# Test connection
psql -U solar_user -d solar_production -h localhost

# Nếu báo "authentication failed":
# Kiểm tra .env file có đúng password không
cat /var/www/solar/.env | grep POSTGRES

# Kiểm tra PostgreSQL running
sudo systemctl status postgresql
```

### 6. **UFW chặn connection**

```bash
# Kiểm tra UFW rules
sudo ufw status numbered

# Xem rules cho port 4000, 3001
sudo ufw status | grep -E "4000|3001"

# Nếu chưa có, chạy lại script
/tmp/ufw-solar-rules.sh
```

---

## 🔍 Kiểm Tra Tổng Thể

Script kiểm tra nhanh toàn bộ:

```bash
#!/bin/bash
echo "=== SOLAR DEPLOYMENT CHECK ==="
echo ""

echo "1. PM2 Processes:"
pm2 list | grep solar

echo ""
echo "2. Ports Listening:"
sudo ss -tlnp | grep -E ":4000|:3001"

echo ""
echo "3. Backend Health:"
curl -s http://localhost:4000/api/health || echo "Backend not responding"

echo ""
echo "4. Frontend:"
curl -sI http://localhost:3001 | head -n 1

echo ""
echo "5. Database Connection:"
psql -U solar_user -d solar_production -h localhost -c "SELECT 1" 2>&1 | head -n 3

echo ""
echo "6. Caddy Container:"
docker ps | grep caddy

echo ""
echo "7. UFW Rules for Solar:"
sudo ufw status | grep -E "4000|3001"

echo ""
echo "=== CHECK COMPLETE ==="
```

Lưu script trên vào `/tmp/check-solar.sh`, chạy:

```bash
chmod +x /tmp/check-solar.sh
/tmp/check-solar.sh
```

---

## 📝 Tổng Kết Ports

| Service          | Port | Protocol | Notes                     |
|------------------|------|----------|---------------------------|
| Solar Backend    | 4000 | HTTP     | Proxied qua Caddy         |
| Solar Frontend   | 3001 | HTTP     | Proxied qua Caddy         |
| Caddy (HTTP)     | 80   | HTTP     | Redirect to HTTPS         |
| Caddy (HTTPS)    | 443  | HTTPS    | Reverse proxy             |
| PostgreSQL       | 5432 | TCP      | Database (dùng chung)     |
| Redis            | 6379 | TCP      | Cache (dùng chung)        |

---

## 🆘 Support Checklist

Nếu gặp vấn đề, kiểm tra theo thứ tự:

- [ ] DNS đã trỏ đúng IP: `dig solar.tinhoclehoang.com`
- [ ] Backend chạy port 4000: `sudo ss -tlnp | grep :4000`
- [ ] Frontend chạy port 3001: `sudo ss -tlnp | grep :3001`
- [ ] PM2 processes đang online: `pm2 status`
- [ ] Database credentials đúng trong `.env`
- [ ] UFW có rules cho port 4000, 3001
- [ ] Caddy đã add config block cho solar.tinhoclehoang.com
- [ ] Caddy container đang chạy: `docker ps | grep caddy`
- [ ] Logs không có error: `pm2 logs` và `docker compose logs caddy`

---

**Good luck! 🚀**

Mọi thắc mắc vui lòng liên hệ!

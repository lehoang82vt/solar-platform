# ⚡ Solar - Quick Start Guide (Existing VPS)

Hướng dẫn ngắn gọn để deploy Solar lên VPS **đã có sẵn dịch vụ**.

## 📋 Prerequisites

- ✅ VPS đã chạy: Caddy, PostgreSQL, Redis, UFW
- ✅ Domain `solar.tinhoclehoang.com` đã trỏ về IP VPS
- ✅ SSH access với user `lehoang`

## 🚀 Deploy trong 9 Bước

### 1️⃣ Upload Code

**Option A: Git**
```bash
ssh lehoang@103.186.65.23
cd /var/www
git clone <your-repo-url> solar
```

**Option B: SCP từ Windows**
```powershell
cd D:\Soft\VPS\Solar
tar --exclude='node_modules' --exclude='.git' -czf solar.tar.gz .
scp solar.tar.gz lehoang@103.186.65.23:/home/lehoang/

# Trên VPS
ssh lehoang@103.186.65.23
sudo mkdir -p /var/www/solar
sudo chown -R lehoang:lehoang /var/www/solar
tar -xzf solar.tar.gz -C /var/www/solar
```

### 2️⃣ Setup Database

```bash
scp deploy/setup-solar-database.sh lehoang@103.186.65.23:/tmp/
ssh lehoang@103.186.65.23
chmod +x /tmp/setup-solar-database.sh
/tmp/setup-solar-database.sh
```

**⚠️ LƯU LẠI thông tin database được hiển thị!**

### 3️⃣ Configure Environment

```bash
cd /var/www/solar
cp .env.production.example .env
nano .env
```

Cập nhật:
- `POSTGRES_PASSWORD` (từ bước 2)
- `JWT_SECRET` (run: `openssl rand -base64 32`)
- `SESSION_SECRET` (run: `openssl rand -base64 32`)

### 4️⃣ Build Application

```bash
cd /var/www/solar
npm install
npm run build
cd packages/backend
npm run migrate
cd ../..
```

### 5️⃣ Add Caddy Config

```bash
nano ~/hybrid-stack/Caddyfile
```

Thêm vào cuối file:

```caddy
solar.tinhoclehoang.com {
    route /api* {
        reverse_proxy host.docker.internal:4000
    }
    route {
        reverse_proxy host.docker.internal:3001
    }
}
```

Restart Caddy:

```bash
cd ~/hybrid-stack
docker compose restart caddy
```

### 6️⃣ Setup UFW Rules

```bash
scp deploy/ufw-solar-rules.sh lehoang@103.186.65.23:/tmp/
ssh lehoang@103.186.65.23
chmod +x /tmp/ufw-solar-rules.sh
/tmp/ufw-solar-rules.sh
```

### 7️⃣ Start with PM2

```bash
cd /var/www/solar
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
```

### 8️⃣ Verify

```bash
pm2 status
pm2 logs
sudo ss -tlnp | grep -E ":4000|:3001"
curl http://localhost:4000/api/health
```

### 9️⃣ Test Browser

Mở: https://solar.tinhoclehoang.com

---

## 🔄 Update Code

```bash
cd /var/www/solar
git pull  # hoặc upload file mới
npm install
npm run build
cd packages/backend && npm run migrate && cd ../..
pm2 restart all
```

---

## 🐛 Troubleshooting

**Backend không chạy:**
```bash
pm2 logs solar-backend
sudo ss -tlnp | grep :4000
```

**Caddy không proxy:**
```bash
docker exec hybrid-stack-caddy-1 wget -O- http://host.docker.internal:4000/api/health
cd ~/hybrid-stack
docker compose logs caddy
```

**Database error:**
```bash
psql -U solar_user -d solar_production -h localhost
cat /var/www/solar/.env | grep POSTGRES
```

---

## 📞 Support

Chi tiết đầy đủ: Xem file `DEPLOYMENT-VPS-EXISTING.md`

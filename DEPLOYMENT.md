# 🚀 Hướng Dẫn Deploy Solar lên VPS

## 📋 Thông Tin VPS

- **IP**: 103.186.65.23
- **Domain**: solar.tinhoclehoang.com
- **OS**: Ubuntu/Debian (assumed)

## 📦 Yêu Cầu

- VPS chạy Ubuntu 20.04+ hoặc Debian 10+
- SSH access với quyền sudo
- Domain đã trỏ về IP VPS

---

## 🎯 Các Bước Deploy

### Bước 1: Kết nối VPS

```bash
ssh root@103.186.65.23
```

Hoặc nếu dùng user khác:

```bash
ssh your_username@103.186.65.23
```

### Bước 2: Upload Scripts lên VPS

Từ máy local của bạn (Windows), upload các file cần thiết:

```powershell
# Upload setup scripts
scp deploy/setup-vps.sh root@103.186.65.23:/tmp/
scp deploy/setup-database.sh root@103.186.65.23:/tmp/

# Hoặc dùng WinSCP, FileZilla để upload
```

### Bước 3: Cài Đặt Môi Trường VPS

Trên VPS, chạy script cài đặt:

```bash
# Cấp quyền thực thi
chmod +x /tmp/setup-vps.sh
chmod +x /tmp/setup-database.sh

# Chạy script cài đặt môi trường
/tmp/setup-vps.sh
```

Script này sẽ cài đặt:
- ✅ Node.js 20.x
- ✅ PostgreSQL
- ✅ Redis
- ✅ Nginx
- ✅ Certbot (Let's Encrypt SSL)
- ✅ PM2
- ✅ Git

### Bước 4: Thiết Lập Database

```bash
# Chạy script tạo database
/tmp/setup-database.sh
```

**⚠️ QUAN TRỌNG**: Script sẽ tạo database và hiển thị thông tin đăng nhập. **Lưu lại thông tin này!**

### Bước 5: Clone Code lên VPS

Có 2 cách:

#### Cách 1: Từ Git Repository (Khuyến nghị)

```bash
cd /var/www
git clone https://github.com/your-username/solar.git
cd solar
```

#### Cách 2: Upload trực tiếp từ máy local

Nén project và upload:

```powershell
# Trên Windows (trong thư mục Solar)
# Nén project (loại trừ node_modules)
tar --exclude='node_modules' --exclude='.git' -czf solar.tar.gz .

# Upload lên VPS
scp solar.tar.gz root@103.186.65.23:/var/www/

# Trên VPS
cd /var/www
mkdir -p solar
tar -xzf solar.tar.gz -C solar
cd solar
```

### Bước 6: Cấu Hình Environment Variables

```bash
cd /var/www/solar

# Tạo file .env từ template
cp .env.example .env

# Chỉnh sửa .env với thông tin thực tế
nano .env
```

Cập nhật các giá trị sau trong `.env`:

```env
# Database (sử dụng thông tin từ Bước 4)
POSTGRES_DB=solar_production
POSTGRES_USER=solar_user
POSTGRES_PASSWORD=<password_from_step_4>
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Backend
NODE_ENV=production
PORT=3000

# JWT Secret (tạo random string)
JWT_SECRET=<your_random_secret_here>

# Frontend URL
NEXT_PUBLIC_API_URL=https://solar.tinhoclehoang.com/api
```

Để tạo JWT_SECRET ngẫu nhiên:

```bash
openssl rand -base64 32
```

### Bước 7: Build và Deploy

```bash
cd /var/www/solar

# Cài đặt dependencies
npm install

# Build tất cả packages
npm run build

# Chạy database migrations
cd packages/backend
npm run migrate

# Quay về thư mục gốc
cd /var/www/solar
```

### Bước 8: Khởi Động Ứng Dụng với PM2

```bash
# Tạo thư mục logs
mkdir -p logs

# Start ứng dụng với PM2
pm2 start ecosystem.config.js

# Lưu danh sách process
pm2 save

# Kiểm tra status
pm2 status

# Xem logs
pm2 logs
```

### Bước 9: Cấu Hình Nginx

```bash
# Copy nginx config
sudo cp deploy/nginx-solar.conf /etc/nginx/sites-available/solar

# Tạo symbolic link
sudo ln -s /etc/nginx/sites-available/solar /etc/nginx/sites-enabled/

# Xóa config default (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Bước 10: Cài Đặt SSL Certificate (Let's Encrypt)

```bash
# Tạo thư mục cho Certbot challenge
sudo mkdir -p /var/www/certbot

# Chạy Certbot
sudo certbot --nginx -d solar.tinhoclehoang.com

# Làm theo hướng dẫn:
# 1. Nhập email của bạn
# 2. Đồng ý Terms of Service (Y)
# 3. Chọn redirect HTTP to HTTPS (option 2)
```

Certbot sẽ tự động:
- Tạo SSL certificate
- Cập nhật Nginx config
- Setup auto-renewal

Kiểm tra auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## ✅ Kiểm Tra Deployment

### 1. Kiểm tra PM2

```bash
pm2 status
pm2 logs
pm2 monit
```

### 2. Kiểm tra Nginx

```bash
sudo systemctl status nginx
sudo nginx -t
```

### 3. Kiểm tra PostgreSQL

```bash
sudo systemctl status postgresql
```

### 4. Kiểm tra Redis

```bash
sudo systemctl status redis
redis-cli ping  # Should return PONG
```

### 5. Test Website

Mở trình duyệt và truy cập:

- **Frontend**: https://solar.tinhoclehoang.com
- **Backend API**: https://solar.tinhoclehoang.com/api

---

## 🔄 Deploy Lại (Update Code)

Khi có code mới, chạy:

```bash
cd /var/www/solar

# Pull code mới
git pull origin main

# Hoặc upload file mới từ local

# Install dependencies (nếu có thay đổi)
npm install

# Build lại
npm run build

# Run migrations (nếu có)
cd packages/backend
npm run migrate
cd ../..

# Restart PM2
pm2 restart all

# Hoặc dùng script tự động
./deploy/deploy.sh
```

---

## 📊 Quản Lý và Monitoring

### PM2 Commands

```bash
pm2 list                 # Danh sách processes
pm2 logs                 # Xem logs
pm2 logs solar-backend   # Logs của backend
pm2 logs solar-frontend  # Logs của frontend
pm2 monit               # Monitor real-time
pm2 restart all         # Restart tất cả
pm2 restart solar-backend  # Restart backend
pm2 stop all            # Stop tất cả
pm2 delete all          # Xóa tất cả processes
```

### Nginx Commands

```bash
sudo systemctl status nginx    # Status
sudo systemctl restart nginx   # Restart
sudo systemctl reload nginx    # Reload config
sudo nginx -t                  # Test config
```

### Database Commands

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Connect to your database
\c solar_production

# List tables
\dt

# Exit
\q
```

### View Logs

```bash
# PM2 logs
pm2 logs

# Nginx access log
sudo tail -f /var/log/nginx/solar-access.log

# Nginx error log
sudo tail -f /var/log/nginx/solar-error.log
```

---

## 🐛 Troubleshooting

### Application không chạy

```bash
# Kiểm tra PM2 logs
pm2 logs

# Kiểm tra port có đang sử dụng không
sudo netstat -tlnp | grep :3000
sudo netstat -tlnp | grep :3001
```

### Database connection error

```bash
# Kiểm tra PostgreSQL running
sudo systemctl status postgresql

# Kiểm tra credentials trong .env
cat /var/www/solar/.env

# Test connection
psql -U solar_user -d solar_production -h localhost
```

### Nginx error

```bash
# Kiểm tra config
sudo nginx -t

# Xem error log
sudo tail -100 /var/log/nginx/error.log
```

### SSL Certificate issues

```bash
# Renew certificate manually
sudo certbot renew

# Check certificate
sudo certbot certificates
```

---

## 🔒 Bảo Mật

### Firewall Setup

```bash
# Cài ufw nếu chưa có
sudo apt install ufw

# Allow SSH
sudo ufw allow 22

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Secure PostgreSQL

```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Ensure local connections use password authentication
# local   all   all   md5
```

### Regular Updates

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Update Node packages
cd /var/www/solar
npm update
```

---

## 📝 Notes

- Backup database định kỳ
- Monitor disk space và memory
- Kiểm tra logs thường xuyên
- Setup monitoring tools (optional): Grafana, Prometheus

---

## 🆘 Support

Nếu gặp vấn đề:

1. Kiểm tra logs: `pm2 logs`
2. Kiểm tra Nginx error log: `sudo tail -f /var/log/nginx/solar-error.log`
3. Kiểm tra database connection
4. Kiểm tra .env file có đúng không

---

**Good luck! 🚀**

# Hướng dẫn update trên VPS

## ⚠️ QUAN TRỌNG: Code đã được merge vào `main` branch

Tất cả các fix đã được merge vào `main`. Bạn chỉ cần pull từ `main` là được.

## Cách 1: Dùng script tự động (KHUYẾN NGHỊ)

```bash
cd /var/www/solar
bash deploy/update-from-main.sh
```

## Cách 2: Làm thủ công

```bash
cd /var/www/solar

# Đảm bảo đang ở branch main
git checkout main

# Pull code mới nhất
git pull origin main

# Install và build
npm install
cd packages/frontend
rm -rf .next
npm run build

# Restart
cd /var/www/solar
pm2 restart solar-frontend
pm2 status
```

## Kiểm tra sau khi update

1. **Menu "Cài đặt" xuất hiện:**
   - Vào Sales portal
   - Xem sidebar có menu "Cài đặt" không

2. **Trang settings hoạt động:**
   - Click "Cài đặt"
   - URL: `https://solar.tinhoclehoang.com/sales/settings`
   - Thấy form "Đổi mật khẩu"

3. **Tạo lead không còn lỗi:**
   - Thử tạo lead mới
   - Không còn lỗi "Không thể tạo lead"

4. **Các API khác hoạt động:**
   - Projects, Quotes, Contracts không còn lỗi

## Nếu vẫn không thấy thay đổi

### Kiểm tra code đã pull chưa:

```bash
cd /var/www/solar
git log --oneline -3
```

Phải thấy commit: `"Merge: Fix API URL normalization và thêm trang đổi mật khẩu Sales"`

### Kiểm tra file settings có chưa:

```bash
ls -la packages/frontend/src/app/(sales)/sales/settings/page.tsx
```

File phải tồn tại.

### Clear cache và rebuild lại:

```bash
cd /var/www/solar/packages/frontend
rm -rf .next
npm run build
cd /var/www/solar
pm2 restart solar-frontend
```

### Kiểm tra logs:

```bash
pm2 logs solar-frontend --lines 50
```

Xem có lỗi gì không.

# Checklist kiểm tra VPS

## Bước 1: Kiểm tra branch hiện tại trên VPS

SSH vào VPS và chạy:

```bash
cd /var/www/solar
git branch --show-current
```

**Nếu thấy `main` hoặc branch khác**, bạn cần checkout đúng branch:

```bash
git fetch origin
git checkout cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2
```

## Bước 2: Kiểm tra code đã có chưa

Kiểm tra xem file settings đã có chưa:

```bash
ls -la packages/frontend/src/app/(sales)/sales/settings/page.tsx
```

**Nếu file không tồn tại** → code chưa được pull.

## Bước 3: Pull và build lại

### Cách 1: Dùng script tự động (KHUYẾN NGHỊ)

```bash
cd /var/www/solar
bash deploy/update-frontend.sh cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2
```

### Cách 2: Làm thủ công

```bash
cd /var/www/solar

# Đảm bảo đúng branch
git fetch origin
git checkout cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2
git pull origin cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2

# Install và build
npm install
cd packages/frontend
npm run build

# Restart
cd /var/www/solar
pm2 restart solar-frontend
pm2 status
```

## Bước 4: Kiểm tra sau khi deploy

1. **Kiểm tra menu "Cài đặt" có xuất hiện không:**
   - Vào trang Sales portal
   - Xem sidebar bên trái có menu "Cài đặt" không

2. **Kiểm tra trang settings:**
   - Click vào menu "Cài đặt"
   - URL phải là: `https://solar.tinhoclehoang.com/sales/settings`
   - Phải thấy form "Đổi mật khẩu"

3. **Kiểm tra API không còn lỗi:**
   - Thử tạo lead mới
   - Thử xem danh sách projects
   - Không còn lỗi "Không tải được..."

## Bước 5: Nếu vẫn không thấy thay đổi

### Kiểm tra build có thành công không:

```bash
cd /var/www/solar/packages/frontend
ls -la .next/
```

Nếu thư mục `.next` không có hoặc cũ → build chưa chạy.

### Kiểm tra PM2 có restart không:

```bash
pm2 logs solar-frontend --lines 50
```

Xem có lỗi gì không.

### Clear cache và rebuild:

```bash
cd /var/www/solar/packages/frontend
rm -rf .next
npm run build
pm2 restart solar-frontend
```

## Lưu ý quan trọng

- **Branch trên VPS phải là:** `cursor/l-i-trang-ng-nh-p-tr-n-vps-0ea2`
- **Không phải:** `main` hoặc branch khác
- Sau khi pull, **phải build lại** frontend
- Sau khi build, **phải restart PM2**

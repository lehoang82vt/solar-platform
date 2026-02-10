export default function PublicFooter() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">Solar-GPT</h3>
            <p className="text-gray-400 text-sm">
              Hệ thống báo giá điện mặt trời thông minh
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Sản phẩm</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>Hệ thống hòa lưới</li>
              <li>Hệ thống độc lập</li>
              <li>Hệ thống hybrid</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Hỗ trợ</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>Liên hệ</li>
              <li>FAQ</li>
              <li>Chính sách bảo hành</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Liên hệ</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>Hotline: 1900 xxxx</li>
              <li>Email: info@solar-gpt.vn</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
          © 2024 Solar-GPT. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

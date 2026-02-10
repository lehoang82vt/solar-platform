'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CTASection() {
  return (
    <section id="about" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Sẵn sàng tiết kiệm điện?
          </h2>
          <p className="text-gray-600 mb-8">
            Liên hệ ngay để được tư vấn và báo giá miễn phí. Đội ngũ chuyên gia sẵn sàng hỗ trợ bạn.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/#calculator">Tính toán ngay</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Đăng nhập đối tác</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

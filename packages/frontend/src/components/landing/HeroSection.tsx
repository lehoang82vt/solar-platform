'use client';

import { Button } from '@/components/ui/button';
import { ArrowDown, Sun } from 'lucide-react';

export default function HeroSection() {
  const scrollToCalculator = () => {
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-sky-50 to-orange-50 animate-gradient" />

      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />

      {/* Sun icon accent */}
      <div className="absolute top-16 right-16 opacity-10">
        <Sun className="w-48 h-48 text-amber-400" strokeWidth={1} />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 backdrop-blur-sm border border-amber-200/50 text-sm text-amber-700 mb-8">
          <Sun className="w-4 h-4" />
          <span>Tư vấn lắp đặt điện mặt trời</span>
        </div>

        {/* Main headline - Hook question */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Mỗi tháng bạn đang trả{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
            bao nhiêu tiền điện?
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-4 leading-relaxed">
          Hệ điện mặt trời phù hợp có thể giúp bạn{' '}
          <strong className="text-gray-800">tiết kiệm đến 80% hóa đơn điện</strong> mỗi tháng.
          Kiểm tra ngay trong 30 giây!
        </p>

        {/* Trust message */}
        <p className="text-sm text-gray-400 mb-10">
          Miễn phí &bull; Không cần đăng ký &bull; Kết quả tức thì
        </p>

        {/* CTA Button */}
        <Button
          size="lg"
          onClick={scrollToCalculator}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg px-10 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 pulse-glow"
        >
          Tính toán ngay
          <ArrowDown className="w-5 h-5 ml-2 animate-bounce" />
        </Button>
      </div>
    </section>
  );
}

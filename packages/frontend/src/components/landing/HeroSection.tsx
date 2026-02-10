'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function HeroSection() {
  const scrollToCalculator = () => {
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative py-20 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-white to-amber-100 animate-gradient" />

      {/* Decorative floating orbs */}
      <div
        className="absolute -top-40 -right-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
        aria-hidden
      />
      <div
        className="absolute -top-20 -left-40 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
        style={{ animationDelay: '2s' }}
        aria-hidden
      />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-2 glass rounded-full text-sm font-medium text-sky-700">
            ⚡ Tiết kiệm thông minh, tự động tính toán
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Tiết kiệm điện với
            <span className="relative inline-block ml-3">
              <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent">
                năng lượng mặt trời
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="8"
                viewBox="0 0 300 8"
                fill="none"
                aria-hidden
              >
                <path
                  d="M1 5.5C50 2.5 100 1 150 2.5C200 4 250 5.5 299 5.5"
                  stroke="url(#paint0_linear)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="paint0_linear" x1="0" y1="0" x2="300" y2="0">
                    <stop stopColor="#0284c7" />
                    <stop offset="1" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </h1>

          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Tính toán ngay hệ thống điện mặt trời phù hợp với gia đình bạn. Tiết kiệm đến{' '}
            <span className="font-bold text-green-600">90% hóa đơn điện</span>.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              size="lg"
              onClick={scrollToCalculator}
              className="group relative px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold rounded-xl shadow-lg shadow-amber-200/50 transition-all transform hover:-translate-y-1 hover:shadow-2xl overflow-hidden border-0"
            >
              <span className="relative z-10 flex items-center gap-2">
                Tính toán ngay
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={scrollToFeatures}
              className="glass border-2 border-white/50 hover:bg-white/90 hover:border-sky-300"
            >
              Tìm hiểu thêm
            </Button>
          </div>

          {/* Enhanced Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              {
                value: '1,000+',
                label: 'Hệ thống lắp đặt',
                gradient: 'from-sky-600 to-blue-700',
                glow: 'from-sky-400 to-blue-500',
              },
              {
                value: '90%',
                label: 'Tiết kiệm điện',
                gradient: 'from-green-600 to-emerald-700',
                glow: 'from-green-400 to-emerald-500',
              },
              {
                value: '25 năm',
                label: 'Bảo hành',
                gradient: 'from-amber-600 to-orange-700',
                glow: 'from-amber-400 to-orange-500',
              },
            ].map((stat, index) => (
              <div key={index} className="group relative">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${stat.glow} rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition`}
                  aria-hidden
                />
                <div className="relative glass p-6 rounded-2xl border border-white/40 hover:border-sky-300 transition-all transform hover:-translate-y-2 hover:shadow-2xl">
                  <div
                    className={`text-4xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-2`}
                  >
                    {stat.value}
                  </div>
                  <div className="text-sm text-slate-600 font-medium">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

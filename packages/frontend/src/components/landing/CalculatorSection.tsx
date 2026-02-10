'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, MapPin, Info, CheckCircle, ArrowRight } from 'lucide-react';

interface CalcResult {
  kwp: number;
  cost: number;
  savings: number;
  payback: number;
}

export default function CalculatorSection() {
  const [monthlyKwh, setMonthlyKwh] = useState('500');
  const [region, setRegion] = useState('south');
  const [result, setResult] = useState<CalcResult | null>(null);

  const calculate = () => {
    const kwh = parseInt(monthlyKwh, 10) || 0;
    const kwp = Math.ceil(kwh / 150 / 0.5) * 0.5;
    const cost = kwp * 15000000;
    const savings = kwh * 2000 * 12;

    setResult({
      kwp,
      cost,
      savings,
      payback: savings > 0 ? Math.ceil(cost / savings) : 0,
    });
  };

  return (
    <section id="calculator" className="relative py-20">
      <div className="absolute inset-0 bg-white bg-grid-pattern" aria-hidden />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-full mb-4">
              <Calculator className="w-5 h-5 text-sky-600 shrink-0" />
              <span className="text-sm font-medium text-sky-700">Công cụ tính toán tự động</span>
            </div>

            <h2 className="text-3xl font-bold text-slate-900 mb-4">Tính toán hệ thống phù hợp</h2>
            <p className="text-slate-600">
              Nhập thông tin để nhận báo giá miễn phí trong{' '}
              <span className="font-semibold text-sky-600">30 giây</span>
            </p>
          </div>

          {/* Calculator Card */}
          <div className="group relative">
            <div
              className="absolute -inset-1 bg-gradient-to-r from-sky-300 via-blue-300 to-cyan-300 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition"
              aria-hidden
            />

            <Card className="relative glass p-8 rounded-2xl border-2 border-white/50 shadow-2xl">
              <div className="space-y-6">
                <div className="relative">
                  <Label
                    htmlFor="kwh"
                    className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2"
                  >
                    <svg
                      className="w-5 h-5 text-sky-600 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Tiêu thụ điện hàng tháng (kWh)
                  </Label>
                  <div className="relative">
                    <Input
                      id="kwh"
                      type="number"
                      value={monthlyKwh}
                      onChange={(e) => setMonthlyKwh(e.target.value)}
                      className="glass border-2 border-slate-200 focus:border-sky-500 text-lg font-semibold pr-16 h-14 rounded-xl"
                      placeholder="VD: 500"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                      kWh
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <Info className="w-4 h-4 shrink-0" />
                    Xem trên hóa đơn điện của bạn
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor="region"
                    className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2"
                  >
                    <MapPin className="w-5 h-5 text-sky-600 shrink-0" />
                    Khu vực
                  </Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger
                      id="region"
                      className="glass border-2 border-slate-200 h-14 rounded-xl text-lg"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="north">🏔️ Miền Bắc</SelectItem>
                      <SelectItem value="central">🏖️ Miền Trung</SelectItem>
                      <SelectItem value="south">☀️ Miền Nam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={calculate}
                  className="group/btn w-full h-14 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:via-orange-600 hover:to-amber-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-amber-300/50 pulse-glow border-0"
                >
                  <span className="flex items-center gap-3">
                    <Calculator className="w-6 h-6 shrink-0" />
                    Tính toán hệ thống phù hợp
                    <ArrowRight className="w-5 h-5 shrink-0 group-hover/btn:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>

              {/* Result */}
              {result && (
                <div className="mt-8 relative">
                  <div
                    className="absolute -inset-2 bg-gradient-to-br from-sky-200 to-blue-200 rounded-2xl blur-xl opacity-30"
                    aria-hidden
                  />

                  <div className="relative p-6 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 rounded-2xl border-2 border-sky-200/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <CheckCircle className="w-6 h-6 text-sky-600 shrink-0" />
                        Kết quả ước tính
                      </h3>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                        Chính xác cao
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between p-3 glass rounded-lg">
                        <span className="text-slate-600 font-medium">Công suất hệ thống</span>
                        <span className="font-bold text-slate-900 text-xl">{result.kwp} kWp</span>
                      </div>

                      <div className="flex justify-between p-3 glass rounded-lg">
                        <span className="text-slate-600 font-medium">Chi phí dự kiến</span>
                        <span className="font-bold text-sky-600 text-xl">
                          {result.cost.toLocaleString('vi-VN')} ₫
                        </span>
                      </div>

                      <div className="relative p-4 glass rounded-lg border-2 border-green-200">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="text-slate-600 font-medium">Tiết kiệm hàng năm</span>
                          <div className="text-right">
                            <div className="font-bold text-green-600 text-2xl">
                              {result.savings.toLocaleString('vi-VN')} ₫
                            </div>
                            <div className="text-xs text-green-600 font-medium">↑ Tiết kiệm 90%</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between p-3 glass rounded-lg">
                        <span className="text-slate-600 font-medium">Hoàn vốn sau</span>
                        <span className="font-bold text-slate-900 text-xl">~{result.payback} năm</span>
                      </div>
                    </div>

                    <Button className="w-full mt-6 h-12 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 border-0">
                      <span className="flex items-center gap-2">
                        Nhận báo giá chi tiết
                        <ArrowRight className="w-5 h-5 shrink-0" />
                      </span>
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <span className="font-medium">Bảo mật tuyệt đối</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-sky-600 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">Phản hồi {'<'} 30s</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-amber-600 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">Miễn phí 100%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

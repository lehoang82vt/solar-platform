'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import {
  Calculator, MapPin, Home, Store, Zap, TrendingDown,
  Loader2, Info, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

interface AnalysisResult {
  suggested_kwp: number;
  est_kwh_month: number;
  est_saving_vnd_month: number;
  est_kwh_year: number;
  est_saving_vnd_year: number;
  est_system_cost: number;
  est_payback_years: number;
  monthly_bill_after: number;
  disclaimer: string;
}

const BILL_SUGGESTIONS = [
  { label: '~1 triệu', value: 1_000_000 },
  { label: '2-3 triệu', value: 2_500_000 },
  { label: '~5 triệu', value: 5_000_000 },
  { label: 'Trên 8 triệu', value: 8_000_000 },
];

const REGIONS = [
  { value: 'NORTH', label: 'Miền Bắc', emoji: '🌤' },
  { value: 'CENTRAL', label: 'Miền Trung', emoji: '☀️' },
  { value: 'SOUTH', label: 'Miền Nam', emoji: '🌞' },
];

function formatVnd(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace('.0', '')} triệu`;
  }
  return amount.toLocaleString('vi-VN');
}

interface LiteAnalysisProps {
  onResult?: (result: AnalysisResult, billVnd: number) => void;
}

export default function CalculatorSection({ onResult }: LiteAnalysisProps) {
  const [billVnd, setBillVnd] = useState('');
  const [region, setRegion] = useState('SOUTH');
  const [customerType, setCustomerType] = useState<'residential' | 'business'>('residential');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const billNumber = parseInt(billVnd.replace(/\D/g, ''), 10) || 0;

  const handleSuggestionClick = (value: number) => {
    setBillVnd(value.toLocaleString('vi-VN'));
  };

  const handleBillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw) {
      setBillVnd(parseInt(raw, 10).toLocaleString('vi-VN'));
    } else {
      setBillVnd('');
    }
  };

  const handleCalculate = async () => {
    if (billNumber < 100_000) {
      setError('Vui lòng nhập số tiền điện hàng tháng (tối thiểu 100,000 VNĐ)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<AnalysisResult>('/api/public/lite-analysis', {
        monthly_bill_vnd: billNumber,
        region,
      });
      setResult(data);
      onResult?.(data, billNumber);
      // Scroll to results
      setTimeout(() => {
        document.getElementById('calc-results')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch {
      setError('Không thể tính toán. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const chartData = result ? [
    { name: 'Hiện tại', value: billNumber, fill: '#ef4444' },
    { name: 'Sau lắp ĐMT', value: result.monthly_bill_after, fill: '#22c55e' },
  ] : [];

  const scrollToContact = () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="calculator" className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-sm mb-4">
            <Calculator className="w-4 h-4" />
            Chỉ mất 30 giây
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Ước tính tiết kiệm cho gia đình bạn
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Nhập tiền điện hàng tháng để xem hệ thống điện mặt trời có thể giúp bạn tiết kiệm bao nhiêu.
          </p>
        </div>

        {/* Input Form */}
        <Card className="p-6 sm:p-8 shadow-xl border-0 bg-gradient-to-b from-white to-gray-50/50">
          <div className="space-y-6">

            {/* Field 1: Monthly bill */}
            <div>
              <Label className="text-base font-semibold text-gray-700 mb-3 block">
                Tiền điện trung bình mỗi tháng (VNĐ)
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Ví dụ: 2,000,000"
                value={billVnd}
                onChange={handleBillChange}
                className="text-lg h-14 text-center font-semibold border-2 focus:border-amber-400"
              />
              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {BILL_SUGGESTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => handleSuggestionClick(s.value)}
                    className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 2: Region */}
            <div>
              <Label className="text-base font-semibold text-gray-700 mb-3 block">
                <MapPin className="w-4 h-4 inline mr-1" />
                Khu vực
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {REGIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRegion(r.value)}
                    className={`px-4 py-3 rounded-xl text-center font-medium transition-all border-2 ${
                      region === r.value
                        ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span className="text-xl block mb-1">{r.emoji}</span>
                    <span className="text-sm">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 3: Customer type */}
            <div>
              <Label className="text-base font-semibold text-gray-700 mb-3 block">
                Loại khách hàng
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCustomerType('residential')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border-2 ${
                    customerType === 'residential'
                      ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Home className="w-5 h-5" />
                  <span className="font-medium">Nhà ở</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('business')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border-2 ${
                    customerType === 'business'
                      ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Store className="w-5 h-5" />
                  <span className="font-medium">Hộ kinh doanh</span>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            {/* Calculate button */}
            <Button
              size="lg"
              onClick={handleCalculate}
              disabled={loading || billNumber < 100_000}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg h-14 rounded-xl shadow-lg"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang phân tích...</>
              ) : (
                <><Calculator className="w-5 h-5 mr-2" /> Phân tích ngay</>
              )}
            </Button>
          </div>
        </Card>

        {/* Results */}
        {result && (
          <div id="calc-results" className="mt-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Key metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-6 text-center bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                <Zap className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <div className="text-3xl font-bold text-gray-900">{result.suggested_kwp} kWp</div>
                <div className="text-sm text-gray-500 mt-1">Công suất đề xuất</div>
              </Card>
              <Card className="p-6 text-center bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                <TrendingDown className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="text-3xl font-bold text-green-600">{formatVnd(result.est_saving_vnd_month)}</div>
                <div className="text-sm text-gray-500 mt-1">Tiết kiệm mỗi tháng</div>
              </Card>
              <Card className="p-6 text-center bg-gradient-to-br from-blue-50 to-sky-50 border-blue-200">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-blue-600 font-bold text-sm">ROI</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">~{result.est_payback_years} năm</div>
                <div className="text-sm text-gray-500 mt-1">Hoàn vốn ước tính</div>
              </Card>
            </div>

            {/* Chart: Before vs After */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-700 mb-4 text-center">
                So sánh hóa đơn điện hàng tháng
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={80}>
                    <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: 600 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(1)}tr`}
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString('vi-VN')} VNĐ`, 'Tiền điện']}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(v) => `${formatVnd(Number(v))} VNĐ`}
                        style={{ fontSize: 13, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center mt-2">
                <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                  <TrendingDown className="w-4 h-4" />
                  Giảm {formatVnd(billNumber - result.monthly_bill_after)} VNĐ/tháng
                </span>
              </div>
            </Card>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 text-sm text-gray-400 bg-gray-50 rounded-xl p-4">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{result.disclaimer}</p>
            </div>

            {/* CTA to next stage */}
            <div className="text-center pt-4">
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-lg px-10 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all"
              >
                Nhận báo giá chi tiết miễn phí
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-sm text-gray-400 mt-3">Chỉ cần xác minh số điện thoại — không mất phí</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

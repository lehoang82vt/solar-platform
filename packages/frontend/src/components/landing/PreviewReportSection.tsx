'use client';

import { Card } from '@/components/ui/card';
import {
  Sun, Zap, TrendingDown, Clock, Calendar, Info, CheckCircle,
} from 'lucide-react';

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

interface PreviewReportProps {
  result: AnalysisResult;
  billVnd: number;
  visible: boolean;
}

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN');
}

export default function PreviewReportSection({ result, billVnd, visible }: PreviewReportProps) {
  if (!visible || !result) return null;

  // Generate 12-month savings table
  const months = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];
  // Slight variation per month for realism
  const seasonalFactor = [0.85, 0.88, 0.95, 1.0, 1.08, 1.1, 1.1, 1.05, 1.0, 0.95, 0.9, 0.85];

  const savingsTable = months.map((name, i) => {
    const factor = seasonalFactor[i];
    const production = Math.round(result.est_kwh_month * factor);
    const saving = Math.round(result.est_saving_vnd_month * factor);
    return { name, production, saving };
  });

  const totalSaving = savingsTable.reduce((s, m) => s + m.saving, 0);
  const totalProduction = savingsTable.reduce((s, m) => s + m.production, 0);

  return (
    <section id="preview-report" className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 text-sm mb-4">
            <CheckCircle className="w-4 h-4" />
            Mẫu báo giá ước tính
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Báo giá hệ thống điện mặt trời
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            Dựa trên thông tin bạn cung cấp, đây là ước tính cho hệ thống phù hợp.
          </p>
        </div>

        {/* System overview cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 text-center">
            <Sun className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{result.suggested_kwp}</div>
            <div className="text-xs text-gray-500 mt-1">kWp công suất</div>
          </Card>
          <Card className="p-5 text-center">
            <Zap className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{formatVnd(totalProduction)}</div>
            <div className="text-xs text-gray-500 mt-1">kWh/năm sản lượng</div>
          </Card>
          <Card className="p-5 text-center">
            <TrendingDown className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">{formatVnd(totalSaving)}</div>
            <div className="text-xs text-gray-500 mt-1">VNĐ tiết kiệm/năm</div>
          </Card>
          <Card className="p-5 text-center">
            <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">~{result.est_payback_years}</div>
            <div className="text-xs text-gray-500 mt-1">năm hoàn vốn</div>
          </Card>
        </div>

        {/* Financial summary */}
        <Card className="p-6 mb-8 bg-gradient-to-r from-gray-50 to-white">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            Tóm tắt tài chính
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Tiền điện hiện tại/tháng:</span>
                <span className="font-semibold text-red-500">{formatVnd(billVnd)} VNĐ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tiền điện sau lắp ĐMT:</span>
                <span className="font-semibold text-green-600">{formatVnd(result.monthly_bill_after)} VNĐ</span>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-gray-700 font-medium">Tiết kiệm/tháng:</span>
                <span className="font-bold text-green-600">{formatVnd(result.est_saving_vnd_month)} VNĐ</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Chi phí hệ thống ước tính:</span>
                <span className="font-semibold">{formatVnd(result.est_system_cost)} VNĐ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tiết kiệm/năm:</span>
                <span className="font-semibold text-green-600">{formatVnd(result.est_saving_vnd_year)} VNĐ</span>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-gray-700 font-medium">Hoàn vốn ước tính:</span>
                <span className="font-bold text-blue-600">~{result.est_payback_years} năm</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Monthly savings table */}
        <Card className="mb-8 overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800">Bảng tiết kiệm theo tháng (ước tính)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tháng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sản lượng (kWh)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiết kiệm (VNĐ)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {savingsTable.map((row) => (
                  <tr key={row.name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{row.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatVnd(row.production)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">{formatVnd(row.saving)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-800">Tổng cả năm</td>
                  <td className="px-4 py-3 text-right text-gray-800">{formatVnd(totalProduction)} kWh</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatVnd(totalSaving)} VNĐ</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Disclaimer */}
        <Card className="p-5 bg-amber-50/50 border-amber-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Lưu ý quan trọng</p>
              <p>
                Đây là <strong>mẫu minh hoạ</strong> dựa trên dữ liệu trung bình.
                Báo giá chính xác sẽ được kỹ thuật viên khảo sát mái nhà thực tế và gửi riêng cho bạn.
                Đội ngũ tư vấn sẽ liên hệ trong thời gian sớm nhất.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Save, Zap, Sun, Moon, Battery } from 'lucide-react';

interface UsageData {
  monthly_kwh: number | null;
  day_usage_pct: number | null;
}

interface UsageFormProps {
  projectId: string;
  initialData?: UsageData;
  onSaved?: () => void;
}

export default function UsageForm({ projectId, initialData, onSaved }: UsageFormProps) {
  const { toast } = useToast();
  const [monthlyKwh, setMonthlyKwh] = useState(initialData?.monthly_kwh?.toString() || '');
  const [dayUsagePct, setDayUsagePct] = useState(initialData?.day_usage_pct ?? 70);
  const [compensationPct, setCompensationPct] = useState(80);
  const [saving, setSaving] = useState(false);

  const kwh = parseFloat(monthlyKwh) || 0;
  const nightPct = 100 - dayUsagePct;
  const nightKwhMonth = kwh * nightPct / 100;
  const nightKwhDay = nightKwhMonth / 30;
  const storageTargetDay = nightKwhDay * compensationPct / 100;

  const handleSave = async () => {
    if (kwh <= 0) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập điện tiêu thụ hàng tháng', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/projects/${projectId}/usage`, {
        monthly_kwh: kwh,
        day_usage_pct: dayUsagePct,
      });
      toast({ title: 'Đã lưu', description: 'Cập nhật dữ liệu tiêu thụ thành công' });
      onSaved?.();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lưu dữ liệu tiêu thụ', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="w-5 h-5 text-yellow-500" />
        <h3 className="text-lg font-semibold">Dữ liệu tiêu thụ điện</h3>
      </div>

      <div className="space-y-6">
        {/* Monthly kWh input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Điện tiêu thụ hàng tháng (kWh) <span className="text-red-500">*</span>
          </label>
          <Input
            type="number"
            min="0"
            step="1"
            value={monthlyKwh}
            onChange={(e) => setMonthlyKwh(e.target.value)}
            placeholder="VD: 500"
            className="max-w-xs"
          />
          <p className="text-xs text-gray-400 mt-1">Xem trên hóa đơn điện hàng tháng</p>
        </div>

        {/* Day/Night ratio slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tỷ lệ sử dụng ban ngày / đêm
          </label>
          <div className="px-1">
            <Slider
              value={[dayUsagePct]}
              onValueChange={([val]) => setDayUsagePct(val)}
              min={10}
              max={95}
              step={5}
            />
          </div>
          <div className="flex justify-between mt-3">
            <div className="flex items-center gap-2 text-sm">
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-amber-600">{dayUsagePct}%</span>
              <span className="text-gray-500">ban ngày</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Moon className="w-4 h-4 text-indigo-500" />
              <span className="font-semibold text-indigo-600">{nightPct}%</span>
              <span className="text-gray-500">ban đêm</span>
            </div>
          </div>
        </div>

        {/* Compensation target slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <div className="flex items-center gap-2">
              <Battery className="w-4 h-4 text-green-500" />
              Mục tiêu bù đêm (lưu trữ)
            </div>
          </label>
          <div className="px-1">
            <Slider
              value={[compensationPct]}
              onValueChange={([val]) => setCompensationPct(val)}
              min={0}
              max={100}
              step={10}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">0% (không lưu trữ)</span>
            <span className="text-sm font-semibold text-green-600">{compensationPct}%</span>
            <span className="text-xs text-gray-400">100% (bù toàn bộ đêm)</span>
          </div>
        </div>

        {/* Calculated summary */}
        {kwh > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
            <div className="text-center p-3">
              <Sun className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">
                {(kwh * dayUsagePct / 100).toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">kWh/tháng ban ngày</div>
            </div>
            <div className="text-center p-3">
              <Moon className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">
                {nightKwhMonth.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">kWh/tháng ban đêm</div>
            </div>
            <div className="text-center p-3">
              <Battery className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-green-600">
                {storageTargetDay.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">kWh/ngày lưu trữ</div>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving || kwh <= 0}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Đang lưu...' : 'Lưu dữ liệu'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

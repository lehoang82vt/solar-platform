'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Save, Zap } from 'lucide-react';

interface UsageData {
  monthly_kwh: number | null;
  day_usage_pct: number | null;
  night_kwh?: number | null;
  storage_target_kwh?: number | null;
}

interface UsageFormProps {
  projectId: string;
  initialData?: UsageData;
  onSaved?: () => void;
}

export default function UsageForm({ projectId, initialData, onSaved }: UsageFormProps) {
  const { toast } = useToast();
  const [monthlyKwh, setMonthlyKwh] = useState(initialData?.monthly_kwh?.toString() || '');
  const [dayUsagePct, setDayUsagePct] = useState(initialData?.day_usage_pct?.toString() || '70');
  const [saving, setSaving] = useState(false);

  const nightKwh = monthlyKwh && dayUsagePct
    ? (parseFloat(monthlyKwh) * (100 - parseFloat(dayUsagePct)) / 100).toFixed(1)
    : null;

  const storageTarget = nightKwh ? (parseFloat(nightKwh) * 0.8).toFixed(1) : null;

  const handleSave = async () => {
    const kwh = parseFloat(monthlyKwh);
    const pct = parseFloat(dayUsagePct);
    if (!kwh || kwh <= 0) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập điện tiêu thụ hàng tháng', variant: 'destructive' });
      return;
    }
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: 'Lỗi', description: 'Tỷ lệ sử dụng ban ngày phải từ 0-100%', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/usage`, { monthly_kwh: kwh, day_usage_pct: pct });
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
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-yellow-500" />
        <h3 className="text-lg font-semibold">Dữ liệu tiêu thụ điện</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Điện tiêu thụ hàng tháng (kWh) *
          </label>
          <Input
            type="number"
            min="0"
            step="1"
            value={monthlyKwh}
            onChange={(e) => setMonthlyKwh(e.target.value)}
            placeholder="VD: 500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tỷ lệ sử dụng ban ngày (%)
          </label>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={dayUsagePct}
            onChange={(e) => setDayUsagePct(e.target.value)}
            placeholder="VD: 70"
          />
        </div>
      </div>

      {nightKwh && (
        <div className="mt-4 grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-lg text-sm">
          <div>
            <span className="text-gray-600">Tiêu thụ ban đêm:</span>{' '}
            <span className="font-semibold">{nightKwh} kWh</span>
          </div>
          <div>
            <span className="text-gray-600">Mục tiêu lưu trữ:</span>{' '}
            <span className="font-semibold">{storageTarget} kWh</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Đang lưu...' : 'Lưu dữ liệu'}
        </Button>
      </div>
    </Card>
  );
}

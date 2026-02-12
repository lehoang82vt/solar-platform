'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';

interface FinancialConfig {
  id?: string;
  organization_id?: string;
  // Hard costs (Chi phí cứng)
  inverter_margin_pct: number;
  pv_margin_pct: number;
  battery_margin_pct: number;
  accessory_margin_pct: number;

  // Soft costs (Chi phí mềm)
  labor_cost_type: 'FIXED' | 'PER_KWP' | 'MANUAL';
  labor_fixed_vnd?: number;
  labor_per_kwp_vnd?: number;
  overhead_pct: number;
  logistics_pct: number;

  // Profit gates (Ngưỡng lợi nhuận)
  gross_margin_warning_pct: number;
  gross_margin_block_pct: number;
  net_margin_warning_pct: number;
  net_margin_block_pct: number;
}

export default function FinancialConfigPage() {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FinancialConfig>({
    inverter_margin_pct: 15,
    pv_margin_pct: 15,
    battery_margin_pct: 15,
    accessory_margin_pct: 20,
    labor_cost_type: 'PER_KWP',
    labor_per_kwp_vnd: 3000000,
    overhead_pct: 5,
    logistics_pct: 3,
    gross_margin_warning_pct: 10,
    gross_margin_block_pct: 5,
    net_margin_warning_pct: 8,
    net_margin_block_pct: 3,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/financial/config`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data) {
          setConfig(data);
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/financial/config`, {
        method: config.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Không thể lưu cấu hình');
      }

      setConfig(data);
      toast({
        title: 'Thành công',
        description: 'Đã lưu cấu hình tài chính',
      });
    } catch (err) {
      toast({
        title: 'Lỗi',
        description: err instanceof Error ? err.message : 'Không thể lưu cấu hình',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Cấu hình tài chính</h1>
        <p className="text-muted-foreground mt-2">
          Thiết lập margin, chi phí và ngưỡng lợi nhuận
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Hard Costs - Chi phí cứng */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Chi phí cứng (Hard Costs)
            </CardTitle>
            <CardDescription>
              Margin (%) cho từng loại thiết bị
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inverter_margin">Inverter Margin (%)</Label>
              <Input
                id="inverter_margin"
                type="number"
                step="0.1"
                value={config.inverter_margin_pct}
                onChange={(e) => setConfig({ ...config, inverter_margin_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pv_margin">PV Module Margin (%)</Label>
              <Input
                id="pv_margin"
                type="number"
                step="0.1"
                value={config.pv_margin_pct}
                onChange={(e) => setConfig({ ...config, pv_margin_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="battery_margin">Battery Margin (%)</Label>
              <Input
                id="battery_margin"
                type="number"
                step="0.1"
                value={config.battery_margin_pct}
                onChange={(e) => setConfig({ ...config, battery_margin_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessory_margin">Accessory Margin (%)</Label>
              <Input
                id="accessory_margin"
                type="number"
                step="0.1"
                value={config.accessory_margin_pct}
                onChange={(e) => setConfig({ ...config, accessory_margin_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Soft Costs - Chi phí mềm */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Chi phí mềm (Soft Costs)
            </CardTitle>
            <CardDescription>
              Chi phí nhân công, vận hành, logistics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="labor_type">Loại chi phí nhân công</Label>
                <select
                  id="labor_type"
                  className="w-full border rounded-md p-2"
                  value={config.labor_cost_type}
                  onChange={(e) => setConfig({ ...config, labor_cost_type: e.target.value as 'FIXED' | 'PER_KWP' | 'MANUAL' })}
                  disabled={saving}
                >
                  <option value="FIXED">Cố định</option>
                  <option value="PER_KWP">Theo kWp</option>
                  <option value="MANUAL">Thủ công</option>
                </select>
              </div>

              {config.labor_cost_type === 'FIXED' && (
                <div className="space-y-2">
                  <Label htmlFor="labor_fixed">Chi phí cố định (VNĐ)</Label>
                  <Input
                    id="labor_fixed"
                    type="number"
                    step="100000"
                    value={config.labor_fixed_vnd || 0}
                    onChange={(e) => setConfig({ ...config, labor_fixed_vnd: parseInt(e.target.value) || 0 })}
                    disabled={saving}
                  />
                </div>
              )}

              {config.labor_cost_type === 'PER_KWP' && (
                <div className="space-y-2">
                  <Label htmlFor="labor_per_kwp">Chi phí / kWp (VNĐ)</Label>
                  <Input
                    id="labor_per_kwp"
                    type="number"
                    step="100000"
                    value={config.labor_per_kwp_vnd || 0}
                    onChange={(e) => setConfig({ ...config, labor_per_kwp_vnd: parseInt(e.target.value) || 0 })}
                    disabled={saving}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overhead">Chi phí vận hành (%)</Label>
                <Input
                  id="overhead"
                  type="number"
                  step="0.1"
                  value={config.overhead_pct}
                  onChange={(e) => setConfig({ ...config, overhead_pct: parseFloat(e.target.value) || 0 })}
                  disabled={saving}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logistics">Chi phí logistics (%)</Label>
                <Input
                  id="logistics"
                  type="number"
                  step="0.1"
                  value={config.logistics_pct}
                  onChange={(e) => setConfig({ ...config, logistics_pct: parseFloat(e.target.value) || 0 })}
                  disabled={saving}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit Gates - Ngưỡng lợi nhuận */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Ngưỡng lợi nhuận (Profit Gates)
            </CardTitle>
            <CardDescription>
              Cảnh báo và chặn báo giá khi lợi nhuận thấp
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gross_warning">Gross Margin - Cảnh báo (%)</Label>
              <Input
                id="gross_warning"
                type="number"
                step="0.1"
                value={config.gross_margin_warning_pct}
                onChange={(e) => setConfig({ ...config, gross_margin_warning_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gross_block">Gross Margin - Chặn (%)</Label>
              <Input
                id="gross_block"
                type="number"
                step="0.1"
                value={config.gross_margin_block_pct}
                onChange={(e) => setConfig({ ...config, gross_margin_block_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="net_warning">Net Margin - Cảnh báo (%)</Label>
              <Input
                id="net_warning"
                type="number"
                step="0.1"
                value={config.net_margin_warning_pct}
                onChange={(e) => setConfig({ ...config, net_margin_warning_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="net_block">Net Margin - Chặn (%)</Label>
              <Input
                id="net_block"
                type="number"
                step="0.1"
                value={config.net_margin_block_pct}
                onChange={(e) => setConfig({ ...config, net_margin_block_pct: parseFloat(e.target.value) || 0 })}
                disabled={saving}
                required
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={loadConfig}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </div>
      </form>
    </div>
  );
}

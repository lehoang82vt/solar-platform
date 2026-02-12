'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Check, Minus, Plus, Battery, Zap, Settings } from 'lucide-react';

interface Recommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  power_watt?: number;
  capacity_kwh?: number;
  capacity_kw?: number;
  efficiency?: number;
  sell_price_vnd: number;
  suggested_panel_count?: number;
}

interface SystemConfig {
  id?: string;
  pv_module_id: string | null;
  panel_count: number;
  inverter_id: string | null;
  inverter_count: number;
  battery_id: string | null;
  battery_count: number;
  validation_status?: string;
  validation_reasons?: string[];
}

export default function EquipmentSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id as string;

  const [pvRecs, setPvRecs] = useState<Recommendation[]>([]);
  const [batteryRecs, setBatteryRecs] = useState<Recommendation[]>([]);
  const [inverterRecs, setInverterRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPv, setSelectedPv] = useState<string | null>(null);
  const [panelCount, setPanelCount] = useState(10);
  const [selectedBattery, setSelectedBattery] = useState<string | null>(null);
  const [batteryCount, setBatteryCount] = useState(1);
  const [selectedInverter, setSelectedInverter] = useState<string | null>(null);
  const [inverterCount, setInverterCount] = useState(1);

  const [existingConfig, setExistingConfig] = useState<SystemConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pvRes, batRes, invRes, cfgRes] = await Promise.allSettled([
        api.get<{ recommendations?: Recommendation[]; value?: Recommendation[] }>(`/projects/${projectId}/recommend/pv`),
        api.get<{ recommendations?: Recommendation[]; value?: Recommendation[] }>(`/projects/${projectId}/recommend/battery`),
        api.get<{ recommendations?: Recommendation[]; value?: Recommendation[] }>(`/projects/${projectId}/recommend/inverter`),
        api.get<{ value?: SystemConfig; config?: SystemConfig }>(`/projects/${projectId}/system/config`),
      ]);

      if (pvRes.status === 'fulfilled') {
        const d = pvRes.value.data;
        setPvRecs(d.recommendations || d.value || []);
      }
      if (batRes.status === 'fulfilled') {
        const d = batRes.value.data;
        setBatteryRecs(d.recommendations || d.value || []);
      }
      if (invRes.status === 'fulfilled') {
        const d = invRes.value.data;
        setInverterRecs(d.recommendations || d.value || []);
      }
      if (cfgRes.status === 'fulfilled') {
        const cfg = cfgRes.value.data.value || cfgRes.value.data.config;
        if (cfg) {
          setExistingConfig(cfg);
          if (cfg.pv_module_id) setSelectedPv(cfg.pv_module_id);
          if (cfg.panel_count) setPanelCount(cfg.panel_count);
          if (cfg.battery_id) setSelectedBattery(cfg.battery_id);
          if (cfg.battery_count) setBatteryCount(cfg.battery_count);
          if (cfg.inverter_id) setSelectedInverter(cfg.inverter_id);
          if (cfg.inverter_count) setInverterCount(cfg.inverter_count);
        }
      }
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được dữ liệu thiết bị', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedPv || !selectedInverter) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng chọn tấm PV và inverter', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/system/configure`, {
        pv_module_id: selectedPv,
        panel_count: panelCount,
        inverter_id: selectedInverter,
        inverter_count: inverterCount,
        battery_id: selectedBattery,
        battery_count: selectedBattery ? batteryCount : 0,
      });
      toast({ title: 'Đã lưu', description: 'Cấu hình hệ thống đã được lưu' });
      loadData();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lưu cấu hình', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (vnd: number) => Number(vnd).toLocaleString('vi-VN') + ' VNĐ';

  // Calculate total estimate
  const pvItem = pvRecs.find((r) => r.id === selectedPv);
  const batItem = batteryRecs.find((r) => r.id === selectedBattery);
  const invItem = inverterRecs.find((r) => r.id === selectedInverter);
  const totalEstimate =
    (pvItem ? pvItem.sell_price_vnd * panelCount : 0) +
    (batItem ? batItem.sell_price_vnd * batteryCount : 0) +
    (invItem ? invItem.sell_price_vnd * inverterCount : 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/projects/${projectId}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Chọn thiết bị</h1>
      </div>

      {/* Validation status */}
      {existingConfig?.validation_status && (
        <Card className="p-4 mb-4">
          <div className="flex items-center gap-2">
            <Badge className={existingConfig.validation_status === 'PASS' ? 'bg-green-100 text-green-700' : existingConfig.validation_status === 'WARN' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
              {existingConfig.validation_status}
            </Badge>
            {existingConfig.validation_reasons?.map((r, i) => (
              <span key={i} className="text-sm text-gray-600">{r}</span>
            ))}
          </div>
        </Card>
      )}

      {/* PV Panels */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Tấm pin mặt trời</h2>
        </div>
        {pvRecs.length === 0 ? (
          <p className="text-sm text-gray-500">Không có gợi ý. Vui lòng nhập dữ liệu tiêu thụ và mái nhà trước.</p>
        ) : (
          <div className="space-y-2">
            {pvRecs.map((pv) => (
              <div
                key={pv.id}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedPv === pv.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => {
                  setSelectedPv(pv.id);
                  if (pv.suggested_panel_count) setPanelCount(pv.suggested_panel_count);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{pv.brand} {pv.model}</span>
                    <span className="text-sm text-gray-500 ml-2">{pv.power_watt}W · Hiệu suất {pv.efficiency}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatPrice(pv.sell_price_vnd)}</span>
                    {selectedPv === pv.id && <Check className="w-5 h-5 text-blue-600" />}
                  </div>
                </div>
                {pv.suggested_panel_count && (
                  <div className="text-xs text-gray-500 mt-1">Gợi ý: {pv.suggested_panel_count} tấm ({((pv.power_watt || 0) * pv.suggested_panel_count / 1000).toFixed(1)} kWp)</div>
                )}
              </div>
            ))}
            {selectedPv && (
              <div className="flex items-center gap-3 mt-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Số tấm:</span>
                <Button size="sm" variant="outline" onClick={() => setPanelCount(Math.max(1, panelCount - 1))}><Minus className="w-3 h-3" /></Button>
                <Input type="number" min="1" className="w-20 text-center" value={panelCount} onChange={(e) => setPanelCount(parseInt(e.target.value) || 1)} />
                <Button size="sm" variant="outline" onClick={() => setPanelCount(panelCount + 1)}><Plus className="w-3 h-3" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Battery */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Battery className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold">Pin lưu trữ (tuỳ chọn)</h2>
        </div>
        {batteryRecs.length === 0 ? (
          <p className="text-sm text-gray-500">Không có gợi ý pin lưu trữ.</p>
        ) : (
          <div className="space-y-2">
            <div
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedBattery === null ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
              onClick={() => setSelectedBattery(null)}
            >
              <span className="text-sm text-gray-600">Không sử dụng pin lưu trữ</span>
            </div>
            {batteryRecs.map((bat) => (
              <div
                key={bat.id}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedBattery === bat.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => setSelectedBattery(bat.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{bat.brand} {bat.model}</span>
                    <span className="text-sm text-gray-500 ml-2">{bat.capacity_kwh}kWh</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatPrice(bat.sell_price_vnd)}</span>
                    {selectedBattery === bat.id && <Check className="w-5 h-5 text-blue-600" />}
                  </div>
                </div>
              </div>
            ))}
            {selectedBattery && (
              <div className="flex items-center gap-3 mt-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Số bộ:</span>
                <Button size="sm" variant="outline" onClick={() => setBatteryCount(Math.max(1, batteryCount - 1))}><Minus className="w-3 h-3" /></Button>
                <Input type="number" min="1" className="w-20 text-center" value={batteryCount} onChange={(e) => setBatteryCount(parseInt(e.target.value) || 1)} />
                <Button size="sm" variant="outline" onClick={() => setBatteryCount(batteryCount + 1)}><Plus className="w-3 h-3" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Inverter */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Inverter</h2>
        </div>
        {inverterRecs.length === 0 ? (
          <p className="text-sm text-gray-500">Không có gợi ý inverter.</p>
        ) : (
          <div className="space-y-2">
            {inverterRecs.map((inv) => (
              <div
                key={inv.id}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedInverter === inv.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => setSelectedInverter(inv.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{inv.brand} {inv.model}</span>
                    <span className="text-sm text-gray-500 ml-2">{inv.capacity_kw || inv.power_watt}kW</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatPrice(inv.sell_price_vnd)}</span>
                    {selectedInverter === inv.id && <Check className="w-5 h-5 text-blue-600" />}
                  </div>
                </div>
              </div>
            ))}
            {selectedInverter && (
              <div className="flex items-center gap-3 mt-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Số bộ:</span>
                <Button size="sm" variant="outline" onClick={() => setInverterCount(Math.max(1, inverterCount - 1))}><Minus className="w-3 h-3" /></Button>
                <Input type="number" min="1" className="w-20 text-center" value={inverterCount} onChange={(e) => setInverterCount(parseInt(e.target.value) || 1)} />
                <Button size="sm" variant="outline" onClick={() => setInverterCount(inverterCount + 1)}><Plus className="w-3 h-3" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Total & Actions */}
      <Card className="p-6 sticky bottom-0 bg-white border-t shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Tổng ước tính thiết bị</div>
            <div className="text-2xl font-bold text-green-600">{formatPrice(totalEstimate)}</div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push(`/sales/projects/${projectId}`)}>
              Quay lại
            </Button>
            <Button onClick={handleSaveConfig} disabled={saving || !selectedPv || !selectedInverter}>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

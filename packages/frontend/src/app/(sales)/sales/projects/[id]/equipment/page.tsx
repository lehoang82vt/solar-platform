'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Check, Minus, Plus, Battery, Zap, Settings,
  AlertTriangle, XCircle, CheckCircle, FileText, Loader2,
  ChevronDown, ChevronUp,
} from 'lucide-react';

// --- Types ---

interface PVRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  power_watt?: number;
  efficiency?: number;
  sell_price_vnd: number;
  suggested_panel_count?: number;
}

interface BatteryRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  capacity_kwh?: number;
  sell_price_vnd: number;
  rank?: 'PASS' | 'WARNING' | 'BLOCK';
  block_reason?: string;
}

interface InverterRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  capacity_kw?: number;
  power_watt?: number;
  sell_price_vnd: number;
  rank?: 'PASS' | 'WARNING' | 'BLOCK';
  block_reasons?: string[];
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

// --- Helpers ---

function RankBadge({ rank }: { rank?: string }) {
  if (rank === 'PASS') return <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Phù hợp</Badge>;
  if (rank === 'WARNING') return <Badge className="bg-yellow-100 text-yellow-700 text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Cảnh báo</Badge>;
  if (rank === 'BLOCK') return <Badge className="bg-red-100 text-red-700 text-xs"><XCircle className="w-3 h-3 mr-1" />Không phù hợp</Badge>;
  return null;
}

function ValidationBanner({ status, reasons }: { status?: string; reasons?: string[] }) {
  if (!status) return null;

  const config = {
    PASS: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle, label: 'Cấu hình hợp lệ' },
    WARNING: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: AlertTriangle, label: 'Cảnh báo' },
    WARN: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: AlertTriangle, label: 'Cảnh báo' },
    BLOCK: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle, label: 'Không hợp lệ — Không thể tạo báo giá' },
  }[status] || { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', icon: AlertTriangle, label: status };

  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-xl border ${config.bg} mb-4`}>
      <div className={`flex items-center gap-2 font-semibold ${config.text}`}>
        <Icon className="w-5 h-5" />
        {config.label}
      </div>
      {reasons && reasons.length > 0 && (
        <ul className={`mt-2 text-sm ${config.text} space-y-1`}>
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuantityControl({ value, onChange, min = 1 }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 p-3 bg-gray-50 rounded-lg">
      <span className="text-sm font-medium">Số lượng:</span>
      <Button size="sm" variant="outline" onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="w-3 h-3" />
      </Button>
      <Input
        type="number"
        min={min}
        className="w-20 text-center h-8"
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
      />
      <Button size="sm" variant="outline" onClick={() => onChange(value + 1)}>
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}

const formatPrice = (vnd: number) => Number(vnd).toLocaleString('vi-VN') + ' VNĐ';

function RankGroupHeader({ rank, count }: { rank: string; count: number }) {
  const config = {
    PASS: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', label: 'Đề xuất' },
    WARNING: { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Lắp được' },
    BLOCK: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Không tương thích' },
  }[rank] || { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', label: rank };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${config.bg} ${config.border} border rounded-lg text-xs font-semibold ${config.color}`}>
      <RankBadge rank={rank} />
      <span>({count})</span>
    </div>
  );
}

// --- Main Component ---

export default function EquipmentSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id as string;

  const [pvRecs, setPvRecs] = useState<PVRecommendation[]>([]);
  const [batteryRecs, setBatteryRecs] = useState<BatteryRecommendation[]>([]);
  const [inverterRecs, setInverterRecs] = useState<InverterRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPv, setSelectedPv] = useState<string | null>(null);
  const [panelCount, setPanelCount] = useState(10);
  const [selectedBattery, setSelectedBattery] = useState<string | null>(null);
  const [batteryCount, setBatteryCount] = useState(1);
  const [selectedInverter, setSelectedInverter] = useState<string | null>(null);
  const [inverterCount, setInverterCount] = useState(1);

  const [existingConfig, setExistingConfig] = useState<SystemConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);

  // Collapsible state
  const [pvOpen, setPvOpen] = useState(true);
  const [batteryOpen, setBatteryOpen] = useState(true);
  const [inverterOpen, setInverterOpen] = useState(true);

  useEffect(() => { loadData(); }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pvRes, batRes, invRes, cfgRes] = await Promise.allSettled([
        api.get<{ recommendations?: PVRecommendation[]; value?: PVRecommendation[] }>(`/api/projects/${projectId}/recommend/pv`),
        api.get<{ recommendations?: BatteryRecommendation[]; value?: BatteryRecommendation[] }>(`/api/projects/${projectId}/recommend/battery`),
        api.get<{ recommendations?: InverterRecommendation[]; value?: InverterRecommendation[] }>(`/api/projects/${projectId}/recommend/inverter`),
        api.get<{ value?: SystemConfig; config?: SystemConfig }>(`/api/projects/${projectId}/system/config`),
      ]);

      if (pvRes.status === 'fulfilled') {
        setPvRecs(pvRes.value.data.recommendations || pvRes.value.data.value || []);
      }
      if (batRes.status === 'fulfilled') {
        setBatteryRecs(batRes.value.data.recommendations || batRes.value.data.value || []);
      }
      if (invRes.status === 'fulfilled') {
        setInverterRecs(invRes.value.data.recommendations || invRes.value.data.value || []);
      }
      if (cfgRes.status === 'fulfilled') {
        const cfg = cfgRes.value.data.value || cfgRes.value.data.config;
        if (cfg) {
          setExistingConfig(cfg);
          if (cfg.pv_module_id) { setSelectedPv(cfg.pv_module_id); setPvOpen(false); }
          if (cfg.panel_count) setPanelCount(cfg.panel_count);
          if (cfg.battery_id) { setSelectedBattery(cfg.battery_id); setBatteryOpen(false); }
          if (cfg.battery_count) setBatteryCount(cfg.battery_count);
          if (cfg.inverter_id) { setSelectedInverter(cfg.inverter_id); setInverterOpen(false); }
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
      const { data } = await api.post<{ value?: SystemConfig }>(`/api/projects/${projectId}/system/configure`, {
        pv_module_id: selectedPv,
        panel_count: panelCount,
        inverter_id: selectedInverter,
        inverter_count: inverterCount,
        battery_id: selectedBattery,
        battery_count: selectedBattery ? batteryCount : 0,
      });
      const cfg = data.value || data as unknown as SystemConfig;
      setExistingConfig(cfg);
      toast({ title: 'Đã lưu', description: 'Cấu hình hệ thống đã được lưu' });
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lưu cấu hình', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuote = async () => {
    setCreatingQuote(true);
    try {
      const { data } = await api.post<{ id?: string; quote?: { id: string } }>(`/api/projects/${projectId}/quotes`);
      const quoteId = data.id || data.quote?.id;
      toast({ title: 'Đã tạo', description: 'Báo giá đã được tạo thành công' });
      if (quoteId) router.push(`/sales/quotes/${quoteId}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo báo giá',
        variant: 'destructive',
      });
    } finally {
      setCreatingQuote(false);
    }
  };

  // Compute totals
  const pvItem = pvRecs.find((r) => r.id === selectedPv);
  const batItem = batteryRecs.find((r) => r.id === selectedBattery);
  const invItem = inverterRecs.find((r) => r.id === selectedInverter);
  const totalEstimate =
    (pvItem ? pvItem.sell_price_vnd * panelCount : 0) +
    (batItem ? batItem.sell_price_vnd * batteryCount : 0) +
    (invItem ? invItem.sell_price_vnd * inverterCount : 0);

  const isBlocked = existingConfig?.validation_status === 'BLOCK';

  // Group items by rank
  const groupByRank = <T extends { rank?: string }>(items: T[]) => {
    const pass = items.filter(i => i.rank === 'PASS' || !i.rank);
    const warning = items.filter(i => i.rank === 'WARNING');
    const block = items.filter(i => i.rank === 'BLOCK');
    return { pass, warning, block };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-36 md:pb-28">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/projects/${projectId}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Chọn thiết bị</h1>
      </div>

      {/* Validation banner */}
      <ValidationBanner
        status={existingConfig?.validation_status}
        reasons={existingConfig?.validation_reasons}
      />

      {/* PV Panels — Collapsible */}
      <Card className="mb-4 overflow-hidden">
        <button
          onClick={() => setPvOpen(!pvOpen)}
          className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Tấm pin mặt trời</h2>
          </div>
          <div className="flex items-center gap-3">
            {!pvOpen && pvItem && (
              <div className="text-right hidden sm:block">
                <span className="text-sm font-medium">{pvItem.brand} {pvItem.model}</span>
                <span className="text-sm text-gray-500 ml-2">{panelCount} tấm</span>
                <span className="text-sm font-semibold text-green-600 ml-2">{formatPrice(pvItem.sell_price_vnd * panelCount)}</span>
              </div>
            )}
            {pvOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </button>

        {pvOpen && (
          <div className="px-4 pb-4 md:px-6 md:pb-6 border-t">
            {pvRecs.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Không có gợi ý. Vui lòng nhập dữ liệu tiêu thụ và mái nhà trước.</p>
            ) : (
              <div className="space-y-2 pt-4">
                {pvRecs.map((pv) => (
                  <div
                    key={pv.id}
                    className={`border-2 rounded-xl p-3 md:p-4 cursor-pointer transition-all ${
                      selectedPv === pv.id
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedPv(pv.id);
                      if (pv.suggested_panel_count) setPanelCount(pv.suggested_panel_count);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-sm md:text-base">{pv.brand} {pv.model}</span>
                        <div className="text-xs md:text-sm text-gray-500">
                          {pv.power_watt}W · {pv.efficiency}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{formatPrice(pv.sell_price_vnd)}</span>
                        {selectedPv === pv.id && <Check className="w-5 h-5 text-green-600" />}
                      </div>
                    </div>
                    {pv.suggested_panel_count && (
                      <div className="text-xs text-gray-500 mt-1">
                        Gợi ý: {pv.suggested_panel_count} tấm ({((pv.power_watt || 0) * pv.suggested_panel_count / 1000).toFixed(1)} kWp)
                      </div>
                    )}
                  </div>
                ))}
                {selectedPv && (
                  <QuantityControl value={panelCount} onChange={setPanelCount} />
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Inverter — Collapsible with rank groups */}
      <Card className="mb-4 overflow-hidden">
        <button
          onClick={() => setInverterOpen(!inverterOpen)}
          className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Inverter</h2>
          </div>
          <div className="flex items-center gap-3">
            {!inverterOpen && invItem && (
              <div className="flex items-center gap-2 hidden sm:flex">
                <span className="text-sm font-medium">{invItem.brand} {invItem.model}</span>
                <RankBadge rank={invItem.rank} />
                <span className="text-sm font-semibold text-green-600">{formatPrice(invItem.sell_price_vnd * inverterCount)}</span>
              </div>
            )}
            {inverterOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </button>

        {inverterOpen && (
          <div className="px-4 pb-4 md:px-6 md:pb-6 border-t">
            {inverterRecs.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Chọn tấm PV trước để xem gợi ý inverter.</p>
            ) : (
              <div className="space-y-4 pt-4">
                {(() => {
                  const groups = groupByRank(inverterRecs);
                  return (
                    <>
                      {groups.pass.length > 0 && (
                        <div>
                          <RankGroupHeader rank="PASS" count={groups.pass.length} />
                          <div className="space-y-2 mt-2">
                            {groups.pass.map((inv) => (
                              <InverterItem
                                key={inv.id}
                                inv={inv}
                                selected={selectedInverter === inv.id}
                                onSelect={() => { setSelectedInverter(inv.id); }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {groups.warning.length > 0 && (
                        <div>
                          <RankGroupHeader rank="WARNING" count={groups.warning.length} />
                          <div className="space-y-2 mt-2">
                            {groups.warning.map((inv) => (
                              <InverterItem
                                key={inv.id}
                                inv={inv}
                                selected={selectedInverter === inv.id}
                                onSelect={() => { setSelectedInverter(inv.id); }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {groups.block.length > 0 && (
                        <div>
                          <RankGroupHeader rank="BLOCK" count={groups.block.length} />
                          <div className="space-y-2 mt-2">
                            {groups.block.map((inv) => (
                              <InverterItem
                                key={inv.id}
                                inv={inv}
                                selected={false}
                                onSelect={() => {}}
                                disabled
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {selectedInverter && (
                  <QuantityControl value={inverterCount} onChange={setInverterCount} />
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Battery Storage — Collapsible with rank groups */}
      <Card className="mb-4 overflow-hidden">
        <button
          onClick={() => setBatteryOpen(!batteryOpen)}
          className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Battery className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold">Pin lưu trữ</h2>
            <span className="text-xs text-gray-400">(tuỳ chọn)</span>
          </div>
          <div className="flex items-center gap-3">
            {!batteryOpen && batItem && (
              <div className="flex items-center gap-2 hidden sm:flex">
                <span className="text-sm font-medium">{batItem.brand} {batItem.model}</span>
                <RankBadge rank={batItem.rank} />
                <span className="text-sm font-semibold text-green-600">{formatPrice(batItem.sell_price_vnd * batteryCount)}</span>
              </div>
            )}
            {!batteryOpen && !selectedBattery && (
              <span className="text-xs text-gray-400 hidden sm:block">Không dùng pin</span>
            )}
            {batteryOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </button>

        {batteryOpen && (
          <div className="px-4 pb-4 md:px-6 md:pb-6 border-t">
            {batteryRecs.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Không có gợi ý pin lưu trữ.</p>
            ) : (
              <div className="space-y-4 pt-4">
                {/* No battery option */}
                <div
                  className={`border-2 rounded-xl p-3 cursor-pointer transition-all ${
                    selectedBattery === null
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedBattery(null)}
                >
                  <div className="flex items-center gap-2">
                    {selectedBattery === null && <Check className="w-4 h-4 text-green-600" />}
                    <span className="text-sm text-gray-600">Không sử dụng pin lưu trữ</span>
                  </div>
                </div>

                {(() => {
                  const groups = groupByRank(batteryRecs);
                  return (
                    <>
                      {groups.pass.length > 0 && (
                        <div>
                          <RankGroupHeader rank="PASS" count={groups.pass.length} />
                          <div className="space-y-2 mt-2">
                            {groups.pass.map((bat) => (
                              <BatteryItem
                                key={bat.id}
                                bat={bat}
                                selected={selectedBattery === bat.id}
                                onSelect={() => setSelectedBattery(bat.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {groups.warning.length > 0 && (
                        <div>
                          <RankGroupHeader rank="WARNING" count={groups.warning.length} />
                          <div className="space-y-2 mt-2">
                            {groups.warning.map((bat) => (
                              <BatteryItem
                                key={bat.id}
                                bat={bat}
                                selected={selectedBattery === bat.id}
                                onSelect={() => setSelectedBattery(bat.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {groups.block.length > 0 && (
                        <div>
                          <RankGroupHeader rank="BLOCK" count={groups.block.length} />
                          <div className="space-y-2 mt-2">
                            {groups.block.map((bat) => (
                              <BatteryItem
                                key={bat.id}
                                bat={bat}
                                selected={false}
                                onSelect={() => {}}
                                disabled
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {selectedBattery && (
                  <QuantityControl value={batteryCount} onChange={setBatteryCount} />
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between mb-2 md:mb-0">
            <div>
              <div className="text-xs md:text-sm text-gray-500">Tổng ước tính</div>
              <div className="text-lg md:text-2xl font-bold text-green-600">{formatPrice(totalEstimate)}</div>
            </div>
            <div className="hidden md:flex gap-3">
              <Button variant="outline" onClick={() => router.push(`/sales/projects/${projectId}`)}>
                Quay lại
              </Button>
              <Button onClick={handleSaveConfig} disabled={saving || !selectedPv || !selectedInverter}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang lưu...</> : 'Lưu cấu hình'}
              </Button>
              <Button
                onClick={handleCreateQuote}
                disabled={creatingQuote || isBlocked || !existingConfig}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
              >
                <FileText className="w-4 h-4 mr-2" />
                {creatingQuote ? 'Đang tạo...' : 'Tạo báo giá'}
              </Button>
            </div>
          </div>
          {/* Mobile buttons */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <Button variant="outline" size="sm" onClick={() => router.push(`/sales/projects/${projectId}`)}>
              Quay lại
            </Button>
            <Button size="sm" onClick={handleSaveConfig} disabled={saving || !selectedPv || !selectedInverter}>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
            <Button
              size="sm"
              onClick={handleCreateQuote}
              disabled={creatingQuote || isBlocked || !existingConfig}
              className="col-span-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              {creatingQuote ? 'Đang tạo...' : 'Tạo báo giá'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components for items ---

function InverterItem({ inv, selected, onSelect, disabled }: {
  inv: InverterRecommendation;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const reasons = inv.block_reasons || [];
  const powerKw = (inv.power_watt || 0) / 1000;

  return (
    <div
      className={`border-2 rounded-xl p-3 md:p-4 transition-all ${
        disabled
          ? 'border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed'
          : selected
            ? 'border-green-500 bg-green-50 shadow-sm cursor-pointer'
            : inv.rank === 'WARNING'
              ? 'border-yellow-200 hover:border-yellow-300 cursor-pointer'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
      }`}
      onClick={() => !disabled && onSelect()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm md:text-base">{inv.brand} {inv.model}</span>
            <span className="text-xs text-gray-500">{powerKw.toFixed(1)}kW</span>
          </div>
          {reasons.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {reasons.map((r, i) => (
                <p key={i} className={`text-xs ${disabled ? 'text-red-600' : 'text-yellow-700'}`}>
                  • {r}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold">{formatPrice(inv.sell_price_vnd)}</span>
          {selected && <Check className="w-5 h-5 text-green-600" />}
        </div>
      </div>
    </div>
  );
}

function BatteryItem({ bat, selected, onSelect, disabled }: {
  bat: BatteryRecommendation;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`border-2 rounded-xl p-3 md:p-4 transition-all ${
        disabled
          ? 'border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed'
          : selected
            ? 'border-green-500 bg-green-50 shadow-sm cursor-pointer'
            : bat.rank === 'WARNING'
              ? 'border-yellow-200 hover:border-yellow-300 cursor-pointer'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
      }`}
      onClick={() => !disabled && onSelect()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm md:text-base">{bat.brand} {bat.model}</span>
            <span className="text-xs text-gray-500">{bat.capacity_kwh}kWh</span>
          </div>
          {bat.block_reason && (
            <p className="text-xs text-red-600 mt-1">{bat.block_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold">{formatPrice(bat.sell_price_vnd)}</span>
          {selected && <Check className="w-5 h-5 text-green-600" />}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
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
  ChevronDown,
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

// --- Custom Dropdown Component ---

function EquipmentDropdown<T extends { id: string; brand: string; model: string; sell_price_vnd: number }>({
  items,
  selectedId,
  onSelect,
  renderItem,
  renderSelected,
  placeholder,
  groupByRank,
}: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  placeholder: string;
  groupByRank?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedItem = items.find(i => i.id === selectedId);

  // Group items by rank if applicable
  const groupedItems = groupByRank ? (() => {
    const ranked = items as (T & { rank?: string })[];
    const pass = ranked.filter(i => i.rank === 'PASS' || !i.rank);
    const warning = ranked.filter(i => i.rank === 'WARNING');
    const block = ranked.filter(i => i.rank === 'BLOCK');
    return { pass, warning, block };
  })() : null;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between p-3 md:p-4 border-2 rounded-xl transition-all text-left ${
          selectedItem
            ? 'border-green-300 bg-green-50/50'
            : 'border-gray-200 hover:border-gray-300 bg-white'
        }`}
      >
        {selectedItem ? renderSelected(selectedItem) : (
          <span className="text-gray-400 text-sm">{placeholder}</span>
        )}
        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          {groupedItems ? (
            <>
              {groupedItems.pass.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-green-50 border-b border-green-100 flex items-center gap-2 sticky top-0">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-semibold text-green-700">Đề xuất ({groupedItems.pass.length})</span>
                  </div>
                  {groupedItems.pass.map(item => (
                    <DropdownItem
                      key={item.id}
                      selected={selectedId === item.id}
                      onClick={() => { onSelect(item.id); setOpen(false); }}
                    >
                      {renderItem(item)}
                    </DropdownItem>
                  ))}
                </div>
              )}
              {groupedItems.warning.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2 sticky top-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                    <span className="text-xs font-semibold text-yellow-700">Lắp được — Cảnh báo ({groupedItems.warning.length})</span>
                  </div>
                  {groupedItems.warning.map(item => (
                    <DropdownItem
                      key={item.id}
                      selected={selectedId === item.id}
                      onClick={() => { onSelect(item.id); setOpen(false); }}
                      variant="warning"
                    >
                      {renderItem(item)}
                    </DropdownItem>
                  ))}
                </div>
              )}
              {groupedItems.block.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 sticky top-0">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-semibold text-red-700">Không tương thích ({groupedItems.block.length})</span>
                  </div>
                  {groupedItems.block.map(item => (
                    <DropdownItem
                      key={item.id}
                      selected={false}
                      onClick={() => {}}
                      variant="block"
                      disabled
                    >
                      {renderItem(item)}
                    </DropdownItem>
                  ))}
                </div>
              )}
            </>
          ) : (
            items.map(item => (
              <DropdownItem
                key={item.id}
                selected={selectedId === item.id}
                onClick={() => { onSelect(item.id); setOpen(false); }}
              >
                {renderItem(item)}
              </DropdownItem>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ children, selected, onClick, variant, disabled }: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  variant?: 'warning' | 'block';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors flex items-center gap-2 ${
        disabled
          ? 'opacity-50 cursor-not-allowed bg-red-50/30'
          : selected
            ? 'bg-green-50'
            : variant === 'warning'
              ? 'hover:bg-yellow-50'
              : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {selected && <Check className="w-4 h-4 text-green-600 shrink-0" />}
    </button>
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

      {/* 1. PV Panels */}
      <Card className="mb-4 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Tấm pin mặt trời</h2>
        </div>

        {pvRecs.length === 0 ? (
          <p className="text-sm text-gray-500">Không có gợi ý. Vui lòng nhập dữ liệu tiêu thụ và mái nhà trước.</p>
        ) : (
          <>
            <EquipmentDropdown
              items={pvRecs}
              selectedId={selectedPv}
              onSelect={(id) => {
                setSelectedPv(id);
                const pv = pvRecs.find(p => p.id === id);
                if (pv?.suggested_panel_count) setPanelCount(pv.suggested_panel_count);
              }}
              placeholder="Chọn tấm pin mặt trời..."
              renderSelected={(pv) => (
                <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{pv.brand} {pv.model}</div>
                    <div className="text-xs text-gray-500">{pv.power_watt}W · {pv.efficiency}%</div>
                  </div>
                  <span className="text-sm font-semibold text-green-600 shrink-0">{formatPrice(pv.sell_price_vnd)}</span>
                </div>
              )}
              renderItem={(pv) => (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{pv.brand} {pv.model}</div>
                    <div className="text-xs text-gray-500">
                      {pv.power_watt}W · {pv.efficiency}%
                      {pv.suggested_panel_count && ` · Gợi ý ${pv.suggested_panel_count} tấm`}
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{formatPrice(pv.sell_price_vnd)}</span>
                </div>
              )}
            />
            {selectedPv && (
              <QuantityControl value={panelCount} onChange={setPanelCount} />
            )}
            {selectedPv && pvItem && (
              <div className="mt-2 text-right text-sm">
                <span className="text-gray-500">Thành tiền: </span>
                <span className="font-semibold text-green-600">{formatPrice(pvItem.sell_price_vnd * panelCount)}</span>
              </div>
            )}
          </>
        )}
      </Card>

      {/* 2. Inverter */}
      <Card className="mb-4 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Inverter</h2>
        </div>

        {inverterRecs.length === 0 ? (
          <p className="text-sm text-gray-500">Chọn tấm PV trước để xem gợi ý inverter.</p>
        ) : (
          <>
            <EquipmentDropdown
              items={inverterRecs}
              selectedId={selectedInverter}
              onSelect={(id) => setSelectedInverter(id)}
              placeholder="Chọn inverter..."
              groupByRank
              renderSelected={(inv) => (
                <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{inv.brand} {inv.model}</div>
                      <div className="text-xs text-gray-500">{((inv.power_watt || 0) / 1000).toFixed(1)}kW</div>
                    </div>
                    <RankBadge rank={inv.rank} />
                  </div>
                  <span className="text-sm font-semibold text-green-600 shrink-0">{formatPrice(inv.sell_price_vnd)}</span>
                </div>
              )}
              renderItem={(inv) => {
                const reasons = inv.block_reasons || [];
                return (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{inv.brand} {inv.model}</div>
                        <div className="text-xs text-gray-500">{((inv.power_watt || 0) / 1000).toFixed(1)}kW</div>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{formatPrice(inv.sell_price_vnd)}</span>
                    </div>
                    {reasons.length > 0 && (
                      <div className="mt-1">
                        {reasons.map((r, i) => (
                          <p key={i} className={`text-xs ${inv.rank === 'BLOCK' ? 'text-red-500' : 'text-yellow-600'}`}>• {r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {selectedInverter && (
              <QuantityControl value={inverterCount} onChange={setInverterCount} />
            )}
            {selectedInverter && invItem && (
              <div className="mt-2 text-right text-sm">
                <span className="text-gray-500">Thành tiền: </span>
                <span className="font-semibold text-green-600">{formatPrice(invItem.sell_price_vnd * inverterCount)}</span>
              </div>
            )}
          </>
        )}
      </Card>

      {/* 3. Battery (optional) */}
      <Card className="mb-4 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Battery className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold">Pin lưu trữ</h2>
          <span className="text-xs text-gray-400">(tuỳ chọn)</span>
        </div>

        {batteryRecs.length === 0 ? (
          <div>
            <p className="text-sm text-gray-500 mb-2">Không có gợi ý pin lưu trữ.</p>
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Không sử dụng pin lưu trữ
            </div>
          </div>
        ) : (
          <>
            {/* Toggle: dùng pin hay không */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setSelectedBattery(null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedBattery === null
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Không dùng pin
              </button>
              <button
                type="button"
                onClick={() => {
                  // Select first PASS battery
                  const first = batteryRecs.find(b => b.rank === 'PASS' || !b.rank) || batteryRecs[0];
                  if (first && !selectedBattery) setSelectedBattery(first.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedBattery !== null
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Dùng pin lưu trữ
              </button>
            </div>

            {selectedBattery !== null && (
              <>
                <EquipmentDropdown
                  items={batteryRecs}
                  selectedId={selectedBattery}
                  onSelect={(id) => setSelectedBattery(id)}
                  placeholder="Chọn pin lưu trữ..."
                  groupByRank
                  renderSelected={(bat) => (
                    <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{bat.brand} {bat.model}</div>
                          <div className="text-xs text-gray-500">{bat.capacity_kwh}kWh</div>
                        </div>
                        <RankBadge rank={bat.rank} />
                      </div>
                      <span className="text-sm font-semibold text-green-600 shrink-0">{formatPrice(bat.sell_price_vnd)}</span>
                    </div>
                  )}
                  renderItem={(bat) => (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{bat.brand} {bat.model}</div>
                          <div className="text-xs text-gray-500">{bat.capacity_kwh}kWh</div>
                        </div>
                        <span className="text-sm font-semibold shrink-0">{formatPrice(bat.sell_price_vnd)}</span>
                      </div>
                      {bat.block_reason && (
                        <p className="text-xs text-red-500 mt-1">• {bat.block_reason}</p>
                      )}
                    </div>
                  )}
                />
                <QuantityControl value={batteryCount} onChange={setBatteryCount} />
                {batItem && (
                  <div className="mt-2 text-right text-sm">
                    <span className="text-gray-500">Thành tiền: </span>
                    <span className="font-semibold text-green-600">{formatPrice(batItem.sell_price_vnd * batteryCount)}</span>
                  </div>
                )}
              </>
            )}
          </>
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

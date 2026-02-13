'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import UsageForm from '@/components/forms/UsageForm';
import RoofForm from '@/components/forms/RoofForm';
import dynamic from 'next/dynamic';

const ProjectMap = dynamic(() => import('@/components/maps/ProjectMap'), { ssr: false });
import {
  ArrowLeft, ClipboardList, Cpu, FileText, ScrollText, Plus,
  Pencil, Check, X, Phone, MapPin, User, Package,
  CheckCircle, AlertTriangle, XCircle, Sun, Battery, Zap, Loader2,
} from 'lucide-react';

// --- Interfaces ---

interface ProjectDetail {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  status: string;
  monthly_kwh: number | null;
  day_usage_pct: number | null;
  night_kwh: number | null;
  storage_target_kwh: number | null;
  latitude: number | null;
  longitude: number | null;
  power_phase: number | null;
  created_at: string;
  lead_id: string | null;
}

interface QuoteItem {
  id: string;
  quote_number: string;
  status: string;
  total_vnd: number | null;
  created_at: string;
}

interface ContractItem {
  id: string;
  contract_number: string;
  status: string;
  total_vnd: number | null;
  created_at: string;
}

interface HandoverItem {
  id: string;
  status: string;
  handover_type?: string;
  created_at: string;
  contract_id?: string;
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

interface CatalogItem {
  id: string;
  brand: string;
  model: string;
  power_watt?: number;
  capacity_kwh?: number;
}

// --- Constants ---

const TABS = [
  { key: 'survey', label: 'Khảo sát', icon: ClipboardList },
  { key: 'equipment', label: 'Thiết bị', icon: Cpu },
  { key: 'quotes', label: 'Báo giá', icon: FileText },
  { key: 'contracts', label: 'Hợp đồng', icon: ScrollText },
  { key: 'handovers', label: 'Bàn giao', icon: Package },
] as const;

type TabKey = typeof TABS[number]['key'];

const STATUS_COLORS: Record<string, string> = {
  SURVEY_PENDING: 'bg-gray-100 text-gray-700',
  SURVEYING: 'bg-blue-100 text-blue-700',
  QUOTING: 'bg-purple-100 text-purple-700',
  NEGOTIATING: 'bg-yellow-100 text-yellow-700',
  CONTRACTED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DEMO: 'bg-slate-100 text-slate-600',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SIGNED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

// --- Inline Edit Component ---

function InlineEdit({
  value,
  onSave,
  placeholder,
  icon: Icon,
}: {
  value: string;
  onSave: (val: string) => Promise<void>;
  placeholder: string;
  icon: React.ElementType;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing, value]);

  const handleSave = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-7 text-sm px-2 max-w-[250px]"
          disabled={saving}
        />
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave} disabled={saving}>
          <Check className="w-3.5 h-3.5 text-green-600" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(false)}>
          <X className="w-3.5 h-3.5 text-gray-400" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 group transition-colors"
    >
      <Icon className="w-4 h-4 text-gray-400" />
      <span>{value || placeholder}</span>
      <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
    </button>
  );
}

// --- Validation Badge ---

function ValidationBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === 'PASS' || status === 'OK') {
    return (
      <Badge className="bg-green-100 text-green-700 gap-1">
        <CheckCircle className="w-3 h-3" /> Hợp lệ
      </Badge>
    );
  }
  if (status === 'WARNING' || status === 'WARN') {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 gap-1">
        <AlertTriangle className="w-3 h-3" /> Cảnh báo
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 gap-1">
      <XCircle className="w-3 h-3" /> Không hợp lệ
    </Badge>
  );
}

// --- Main Component ---

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('survey');
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [handovers, setHandovers] = useState<HandoverItem[]>([]);
  const [creatingQuote, setCreatingQuote] = useState(false);

  // Equipment summary state
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
  const [pvInfo, setPvInfo] = useState<CatalogItem | null>(null);
  const [invInfo, setInvInfo] = useState<CatalogItem | null>(null);
  const [batInfo, setBatInfo] = useState<CatalogItem | null>(null);
  const [equipLoading, setEquipLoading] = useState(false);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'quotes') loadQuotes();
    if (activeTab === 'contracts') loadContracts();
    if (activeTab === 'handovers') loadHandovers();
    if (activeTab === 'equipment') loadEquipmentSummary();
  }, [activeTab, projectId]);

  const loadProject = async () => {
    try {
      const { data } = await api.get<{ value: ProjectDetail }>(`/api/projects/${projectId}`);
      setProject(data.value);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được dự án', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadQuotes = async () => {
    try {
      const { data } = await api.get<{ value?: QuoteItem[]; quotes?: QuoteItem[] }>('/api/quotes/v2', {
        params: { project_id: projectId },
      });
      setQuotes(data.value || data.quotes || []);
    } catch { /* ignore */ }
  };

  const loadContracts = async () => {
    try {
      const { data } = await api.get<{ value?: ContractItem[]; contracts?: ContractItem[] }>(`/api/projects/${projectId}/contracts`);
      setContracts(data.value || data.contracts || []);
    } catch { /* ignore */ }
  };

  const loadHandovers = async () => {
    try {
      const { data } = await api.get<{ value?: HandoverItem[] }>(`/api/projects/${projectId}/handovers`);
      setHandovers(data.value || []);
    } catch { /* ignore */ }
  };

  const loadEquipmentSummary = useCallback(async () => {
    setEquipLoading(true);
    try {
      const { data: cfgData } = await api.get<SystemConfig>(`/api/projects/${projectId}/system/config`);
      setSysConfig(cfgData);

      // Fetch product details in parallel
      const [pvRes, invRes, batRes] = await Promise.allSettled([
        cfgData.pv_module_id
          ? api.get<CatalogItem[]>(`/api/catalog/pv_modules`).then(r => {
              const items = Array.isArray(r.data) ? r.data : ((r.data as { value?: CatalogItem[] }).value || []);
              return items.find((p: CatalogItem) => p.id === cfgData.pv_module_id) || null;
            })
          : Promise.resolve(null),
        cfgData.inverter_id
          ? api.get<CatalogItem[]>(`/api/catalog/inverters`).then(r => {
              const items = Array.isArray(r.data) ? r.data : ((r.data as { value?: CatalogItem[] }).value || []);
              return items.find((p: CatalogItem) => p.id === cfgData.inverter_id) || null;
            })
          : Promise.resolve(null),
        cfgData.battery_id
          ? api.get<CatalogItem[]>(`/api/catalog/batteries`).then(r => {
              const items = Array.isArray(r.data) ? r.data : ((r.data as { value?: CatalogItem[] }).value || []);
              return items.find((p: CatalogItem) => p.id === cfgData.battery_id) || null;
            })
          : Promise.resolve(null),
      ]);

      setPvInfo(pvRes.status === 'fulfilled' ? pvRes.value : null);
      setInvInfo(invRes.status === 'fulfilled' ? invRes.value : null);
      setBatInfo(batRes.status === 'fulfilled' ? batRes.value : null);
    } catch {
      setSysConfig(null);
    } finally {
      setEquipLoading(false);
    }
  }, [projectId]);

  const handleUpdateProject = async (field: string, value: string) => {
    try {
      await api.patch(`/api/projects/${projectId}`, { [field]: value });
      toast({ title: 'Đã cập nhật' });
      loadProject();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể cập nhật', variant: 'destructive' });
    }
  };

  const handleCreateQuote = async () => {
    setCreatingQuote(true);
    try {
      const { data } = await api.post<{ id?: string; quote?: { id: string } }>(`/api/projects/${projectId}/quotes`);
      const quoteId = data.id || data.quote?.id;
      toast({ title: 'Đã tạo', description: 'Báo giá đã được tạo thành công' });
      if (quoteId) {
        router.push(`/sales/quotes/${quoteId}`);
      } else {
        loadQuotes();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo báo giá. Hãy chọn thiết bị trước.',
        variant: 'destructive',
      });
    } finally {
      setCreatingQuote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Không tìm thấy dự án</p>
        <Button variant="outline" onClick={() => router.push('/sales/projects')}>Quay lại</Button>
      </div>
    );
  }

  const kWp = pvInfo?.power_watt && sysConfig?.panel_count
    ? ((pvInfo.power_watt * sysConfig.panel_count) / 1000).toFixed(1)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/sales/projects')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <InlineEdit
                value={project.customer_name || ''}
                onSave={(v) => handleUpdateProject('customer_name', v)}
                placeholder="Nhập tên khách hàng"
                icon={User}
              />
              <Badge className={STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}>
                {project.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Editable info row */}
        <div className="flex flex-wrap items-center gap-4 ml-11">
          <InlineEdit
            value={project.customer_phone || ''}
            onSave={(v) => handleUpdateProject('customer_phone', v)}
            placeholder="Số điện thoại"
            icon={Phone}
          />
          <InlineEdit
            value={project.customer_address || ''}
            onSave={(v) => handleUpdateProject('customer_address', v)}
            placeholder="Địa chỉ lắp đặt"
            icon={MapPin}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 md:mx-0 px-4 md:px-0">
        <div className="flex gap-1 border-b mb-6 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 md:gap-2 px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}

      {/* Survey Tab */}
      {activeTab === 'survey' && (
        <div className="space-y-6">
          <Card className="p-4 md:p-6">
            <ProjectMap
              latitude={project.latitude}
              longitude={project.longitude}
              onLocationChange={async (lat, lng, address) => {
                const patch: Record<string, unknown> = { latitude: lat, longitude: lng };
                if (address && !project.customer_address) {
                  patch.customer_address = address;
                }
                await api.patch(`/api/projects/${projectId}`, patch);
                loadProject();
              }}
            />
          </Card>
          <Card className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900">Loại điện</h3>
            </div>
            <div className="flex gap-3">
              {[
                { value: 1, label: '1 pha', desc: 'Hộ gia đình' },
                { value: 3, label: '3 pha', desc: 'Công nghiệp / thương mại' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={async () => {
                    await api.patch(`/api/projects/${projectId}`, { power_phase: opt.value });
                    loadProject();
                  }}
                  className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${
                    (project.power_phase || 1) === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </Card>
          <UsageForm
            projectId={projectId}
            initialData={{
              monthly_kwh: project.monthly_kwh,
              day_usage_pct: project.day_usage_pct,
            }}
            onSaved={loadProject}
          />
          <RoofForm projectId={projectId} hasCoordinates={!!(project.latitude && project.longitude)} onChanged={loadProject} />
        </div>
      )}

      {/* Equipment Tab - Summary + Navigate */}
      {activeTab === 'equipment' && (
        <div className="space-y-4">
          {equipLoading ? (
            <Card className="p-8">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang tải cấu hình...</span>
              </div>
            </Card>
          ) : sysConfig?.pv_module_id ? (
            <>
              {/* Equipment Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* PV Panel */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sun className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium text-gray-500">Tấm PV</span>
                  </div>
                  {pvInfo ? (
                    <>
                      <p className="font-semibold text-gray-900">{pvInfo.brand} {pvInfo.model}</p>
                      <p className="text-sm text-gray-600">
                        {sysConfig.panel_count} tấm
                        {kWp && <span className="text-blue-600 font-medium"> · {kWp} kWp</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">ID: {sysConfig.pv_module_id?.slice(0, 8)}...</p>
                  )}
                </Card>

                {/* Inverter */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium text-gray-500">Inverter</span>
                  </div>
                  {invInfo ? (
                    <>
                      <p className="font-semibold text-gray-900">{invInfo.brand} {invInfo.model}</p>
                      <p className="text-sm text-gray-600">
                        × {sysConfig.inverter_count}
                        {invInfo.power_watt && (
                          <span className="text-blue-600 font-medium"> · {(invInfo.power_watt / 1000).toFixed(1)} kW</span>
                        )}
                      </p>
                    </>
                  ) : sysConfig.inverter_id ? (
                    <p className="text-sm text-gray-400">ID: {sysConfig.inverter_id?.slice(0, 8)}...</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Chưa chọn</p>
                  )}
                </Card>

                {/* Battery */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Battery className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-gray-500">Pin lưu trữ</span>
                  </div>
                  {batInfo ? (
                    <>
                      <p className="font-semibold text-gray-900">{batInfo.brand} {batInfo.model}</p>
                      <p className="text-sm text-gray-600">
                        × {sysConfig.battery_count}
                        {batInfo.capacity_kwh && (
                          <span className="text-green-600 font-medium"> · {(batInfo.capacity_kwh * (sysConfig.battery_count || 1)).toFixed(1)} kWh</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Không có pin</p>
                  )}
                </Card>
              </div>

              {/* Validation Status */}
              {sysConfig.validation_status && (
                <Card className={`p-4 border-l-4 ${
                  sysConfig.validation_status === 'PASS' || sysConfig.validation_status === 'OK'
                    ? 'border-l-green-500 bg-green-50'
                    : sysConfig.validation_status === 'WARNING' || sysConfig.validation_status === 'WARN'
                    ? 'border-l-yellow-500 bg-yellow-50'
                    : 'border-l-red-500 bg-red-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <ValidationBadge status={sysConfig.validation_status} />
                    {sysConfig.validation_reasons && sysConfig.validation_reasons.length > 0 && (
                      <span className="text-sm text-gray-600">
                        {sysConfig.validation_reasons.join(' · ')}
                      </span>
                    )}
                  </div>
                </Card>
              )}

              {/* Edit button */}
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => router.push(`/sales/projects/${projectId}/equipment`)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                >
                  <Cpu className="w-4 h-4 mr-2" />
                  Chỉnh sửa thiết bị
                </Button>
              </div>
            </>
          ) : (
            <Card className="p-6">
              <div className="text-center py-8">
                <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">Chưa chọn thiết bị cho dự án</p>
                <Button onClick={() => router.push(`/sales/projects/${projectId}/equipment`)}>
                  <Plus className="w-4 h-4 mr-1" /> Chọn thiết bị
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Quotes Tab */}
      {activeTab === 'quotes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Báo giá ({quotes.length})</h3>
            <Button onClick={handleCreateQuote} disabled={creatingQuote} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {creatingQuote ? 'Đang tạo...' : 'Tạo báo giá'}
            </Button>
          </div>
          {quotes.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Chưa có báo giá nào</Card>
          ) : (
            <div className="space-y-3">
              {quotes.map((q) => (
                <Card key={q.id} className="p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{q.quote_number}</div>
                      <div className="text-sm text-gray-500">
                        {q.total_vnd ? `${Number(q.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                        {' · '}
                        {new Date(q.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={QUOTE_STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-700'}>
                        {q.status}
                      </Badge>
                      <Link href={`/sales/quotes/${q.id}`}>
                        <Button variant="ghost" size="sm">Chi tiết</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === 'contracts' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Hợp đồng ({contracts.length})</h3>
          </div>
          {contracts.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Chưa có hợp đồng nào</Card>
          ) : (
            <div className="space-y-3">
              {contracts.map((c) => (
                <Card key={c.id} className="p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.contract_number}</div>
                      <div className="text-sm text-gray-500">
                        {c.total_vnd ? `${Number(c.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                        {' · '}
                        {new Date(c.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={CONTRACT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-700'}>
                        {c.status}
                      </Badge>
                      <Link href={`/sales/contracts/${c.id}`}>
                        <Button variant="ghost" size="sm">Chi tiết</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Handovers Tab */}
      {activeTab === 'handovers' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Bàn giao ({handovers.length})</h3>
          </div>
          {handovers.length === 0 ? (
            <Card className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Chưa có bàn giao nào</p>
              <p className="text-xs text-gray-400 mt-1">Bàn giao được tạo sau khi hợp đồng ký xong</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {handovers.map((h) => (
                <Card key={h.id} className="p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        Bàn giao {h.handover_type === 'INSTALLATION' ? 'lắp đặt' : h.handover_type || ''}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(h.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        h.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        h.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        h.status === 'SIGNED' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {h.status === 'COMPLETED' ? 'Hoàn thành' :
                         h.status === 'CANCELLED' ? 'Đã huỷ' :
                         h.status === 'SIGNED' ? 'Đã ký' :
                         h.status === 'DRAFT' ? 'Nháp' : h.status}
                      </Badge>
                      <Link href={`/sales/handovers/${h.id}`}>
                        <Button variant="ghost" size="sm">Chi tiết</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

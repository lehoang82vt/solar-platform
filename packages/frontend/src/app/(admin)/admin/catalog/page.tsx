'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Upload, Download, Pencil, Trash2, Sun, Zap, Battery, Package,
  Loader2, CheckCircle, XCircle, AlertTriangle, Search, Filter,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

type CatalogType = 'pv_modules' | 'inverters' | 'batteries' | 'accessories';

interface CatalogItem {
  id: string;
  sku: string;
  brand?: string;
  model?: string;
  name?: string;
  ready: boolean;
  [key: string]: unknown;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

// ─── Tab Config ──────────────────────────────────────────────────────

const TABS: { key: CatalogType; label: string; icon: React.ElementType }[] = [
  { key: 'pv_modules', label: 'Tấm PV', icon: Sun },
  { key: 'inverters', label: 'Inverter', icon: Zap },
  { key: 'batteries', label: 'Pin', icon: Battery },
  { key: 'accessories', label: 'Phụ kiện', icon: Package },
];

// Column definitions per type
const COLUMNS: Record<CatalogType, { key: string; label: string; type?: string; width?: string }[]> = {
  pv_modules: [
    { key: 'sku', label: 'SKU' },
    { key: 'brand', label: 'Hãng' },
    { key: 'model', label: 'Model' },
    { key: 'power_watt', label: 'Công suất (W)', type: 'number' },
    { key: 'voc', label: 'Voc (V)', type: 'number' },
    { key: 'vmp', label: 'Vmp (V)', type: 'number' },
    { key: 'isc', label: 'Isc (A)', type: 'number' },
    { key: 'imp', label: 'Imp (A)', type: 'number' },
    { key: 'efficiency', label: 'H.suất (%)', type: 'number' },
    { key: 'length_mm', label: 'Dài (mm)', type: 'number' },
    { key: 'width_mm', label: 'Rộng (mm)', type: 'number' },
    { key: 'cost_price_vnd', label: 'Giá nhập', type: 'price' },
    { key: 'sell_price_vnd', label: 'Giá bán', type: 'price' },
  ],
  inverters: [
    { key: 'sku', label: 'SKU' },
    { key: 'brand', label: 'Hãng' },
    { key: 'model', label: 'Model' },
    { key: 'inverter_type', label: 'Loại' },
    { key: 'power_watt', label: 'Công suất (W)', type: 'number' },
    { key: 'max_dc_voltage', label: 'Max DC (V)', type: 'number' },
    { key: 'mppt_count', label: 'MPPT', type: 'number' },
    { key: 'battery_voltage', label: 'V Pin', type: 'number' },
    { key: 'max_charge_current', label: 'I Sạc max', type: 'number' },
    { key: 'cost_price_vnd', label: 'Giá nhập', type: 'price' },
    { key: 'sell_price_vnd', label: 'Giá bán', type: 'price' },
  ],
  batteries: [
    { key: 'sku', label: 'SKU' },
    { key: 'brand', label: 'Hãng' },
    { key: 'model', label: 'Model' },
    { key: 'voltage', label: 'Điện áp (V)', type: 'number' },
    { key: 'capacity_kwh', label: 'Dung lượng (kWh)', type: 'number' },
    { key: 'depth_of_discharge', label: 'DoD (%)', type: 'number' },
    { key: 'cycle_life', label: 'Chu kỳ sống', type: 'number' },
    { key: 'cost_price_vnd', label: 'Giá nhập', type: 'price' },
    { key: 'sell_price_vnd', label: 'Giá bán', type: 'price' },
  ],
  accessories: [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Tên sản phẩm' },
    { key: 'category', label: 'Danh mục' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'cost_price_vnd', label: 'Giá nhập', type: 'price' },
    { key: 'sell_price_vnd', label: 'Giá bán', type: 'price' },
  ],
};

// Form field definitions per type
const FORM_FIELDS: Record<CatalogType, { key: string; label: string; type: string; required?: boolean; placeholder?: string; options?: string[] }[]> = {
  pv_modules: [
    { key: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'VD: TRINA-550W' },
    { key: 'brand', label: 'Hãng', type: 'text', required: true, placeholder: 'VD: Trina Solar' },
    { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'VD: TSM-550DE19' },
    { key: 'power_watt', label: 'Công suất (W)', type: 'number', required: true, placeholder: '550' },
    { key: 'voc', label: 'Voc - Điện áp hở mạch (V)', type: 'number', placeholder: '49.5' },
    { key: 'vmp', label: 'Vmp - Điện áp công suất max (V)', type: 'number', placeholder: '41.7' },
    { key: 'isc', label: 'Isc - Dòng ngắn mạch (A)', type: 'number', placeholder: '14.0' },
    { key: 'imp', label: 'Imp - Dòng công suất max (A)', type: 'number', placeholder: '13.2' },
    { key: 'efficiency', label: 'Hiệu suất (%)', type: 'number', placeholder: '21.3' },
    { key: 'length_mm', label: 'Chiều dài (mm)', type: 'number', placeholder: '2278' },
    { key: 'width_mm', label: 'Chiều rộng (mm)', type: 'number', placeholder: '1134' },
    { key: 'weight_kg', label: 'Trọng lượng (kg)', type: 'number', placeholder: '28.5' },
    { key: 'cost_price_vnd', label: 'Giá nhập (VNĐ)', type: 'number', placeholder: '2500000' },
    { key: 'sell_price_vnd', label: 'Giá bán (VNĐ)', type: 'number', placeholder: '3200000' },
  ],
  inverters: [
    { key: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'VD: SUNGROW-5K' },
    { key: 'brand', label: 'Hãng', type: 'text', required: true, placeholder: 'VD: Sungrow' },
    { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'VD: SG5.0RS' },
    { key: 'inverter_type', label: 'Loại', type: 'select', required: true, options: ['STRING', 'HYBRID', 'MICRO'] },
    { key: 'power_watt', label: 'Công suất AC (W)', type: 'number', required: true, placeholder: '5000' },
    { key: 'max_dc_voltage', label: 'Max DC Voltage (V)', type: 'number', placeholder: '600' },
    { key: 'mppt_count', label: 'Số MPPT', type: 'number', placeholder: '2' },
    { key: 'battery_voltage', label: 'V Pin (V) *Hybrid', type: 'number', placeholder: '48' },
    { key: 'max_charge_current', label: 'Dòng sạc max (A) *Hybrid', type: 'number', placeholder: '100' },
    { key: 'cost_price_vnd', label: 'Giá nhập (VNĐ)', type: 'number', placeholder: '15000000' },
    { key: 'sell_price_vnd', label: 'Giá bán (VNĐ)', type: 'number', placeholder: '20000000' },
  ],
  batteries: [
    { key: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'VD: PYLONTECH-5K' },
    { key: 'brand', label: 'Hãng', type: 'text', required: true, placeholder: 'VD: Pylontech' },
    { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'VD: US5000' },
    { key: 'voltage', label: 'Điện áp (V)', type: 'number', required: true, placeholder: '48' },
    { key: 'capacity_kwh', label: 'Dung lượng (kWh)', type: 'number', placeholder: '4.8' },
    { key: 'depth_of_discharge', label: 'DoD - Độ sâu xả (%)', type: 'number', placeholder: '90' },
    { key: 'cycle_life', label: 'Chu kỳ sống (cycles)', type: 'number', placeholder: '6000' },
    { key: 'cost_price_vnd', label: 'Giá nhập (VNĐ)', type: 'number', placeholder: '25000000' },
    { key: 'sell_price_vnd', label: 'Giá bán (VNĐ)', type: 'number', placeholder: '32000000' },
  ],
  accessories: [
    { key: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'VD: CB-DC-1P' },
    { key: 'name', label: 'Tên sản phẩm', type: 'text', required: true, placeholder: 'VD: CB DC 1P 32A' },
    { key: 'category', label: 'Danh mục', type: 'text', placeholder: 'VD: Bảo vệ' },
    { key: 'unit', label: 'Đơn vị', type: 'text', placeholder: 'piece' },
    { key: 'cost_price_vnd', label: 'Giá nhập (VNĐ)', type: 'number', placeholder: '150000' },
    { key: 'sell_price_vnd', label: 'Giá bán (VNĐ)', type: 'number', placeholder: '250000' },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────

function formatPrice(val: unknown): string {
  const n = Number(val);
  if (!n && n !== 0) return '—';
  return n.toLocaleString('vi-VN');
}

function formatCell(val: unknown, type?: string): string {
  if (val === null || val === undefined || val === '') return '—';
  if (type === 'price') return formatPrice(val);
  if (type === 'number') return String(val);
  return String(val);
}

// ─── Main Component ──────────────────────────────────────────────────

export default function AdminCatalogPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<CatalogType>('pv_modules');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [readyFilter, setReadyFilter] = useState<string>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (readyFilter === 'ready') params.ready = 'true';
      const { data } = await api.get(`/api/catalog/${activeTab}`, { params });
      const list = Array.isArray(data) ? data : (data as { items?: CatalogItem[] }).items || [];
      setItems(list);
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tải danh sách', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, readyFilter, toast]);

  useEffect(() => {
    loadItems();
    setSearch('');
  }, [loadItems]);

  // ─── Filtered items ──────────────────────────────────────────────

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (item.sku || '').toLowerCase().includes(s) ||
      (item.brand || '').toLowerCase().includes(s) ||
      (item.model || '').toLowerCase().includes(s) ||
      (item.name || '').toLowerCase().includes(s)
    );
  });

  // ─── CRUD Handlers ───────────────────────────────────────────────

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({});
    setDialogOpen(true);
  };

  const handleEdit = (item: CatalogItem) => {
    setEditingItem(item);
    const data: Record<string, string> = {};
    FORM_FIELDS[activeTab].forEach((f) => {
      const val = item[f.key];
      data[f.key] = val !== null && val !== undefined ? String(val) : '';
    });
    setFormData(data);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      FORM_FIELDS[activeTab].forEach((f) => {
        const val = formData[f.key];
        if (val === '' || val === undefined) {
          payload[f.key] = null;
        } else if (f.type === 'number') {
          payload[f.key] = val.includes('.') ? parseFloat(val) : parseInt(val, 10);
        } else {
          payload[f.key] = val;
        }
      });

      if (editingItem) {
        await api.put(`/api/catalog/${activeTab}/${editingItem.id}`, payload);
        toast({ title: 'Đã cập nhật' });
      } else {
        await api.post(`/api/catalog/${activeTab}`, payload);
        toast({ title: 'Đã thêm mới' });
      }
      setDialogOpen(false);
      loadItems();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể lưu',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/catalog/${activeTab}/${deleteId}`);
      toast({ title: 'Đã xoá' });
      setDeleteId(null);
      loadItems();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể xoá', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Import/Export ───────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const response = await api.get(`/api/catalog/${activeTab}/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalog_${activeTab}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Đã tải xuống', description: `catalog_${activeTab}.xlsx` });
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể xuất Excel', variant: 'destructive' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<ImportResult>(`/api/catalog/${activeTab}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data);
      toast({
        title: 'Import hoàn tất',
        description: `${data.created} mới, ${data.updated} cập nhật, ${data.skipped} bỏ qua`,
      });
      loadItems();
    } catch {
      toast({ title: 'Lỗi', description: 'Import thất bại', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Render ──────────────────────────────────────────────────────

  const columns = COLUMNS[activeTab];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kho vật tư</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý danh mục thiết bị cho hệ thống điện mặt trời</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = activeTab === tab.key ? items.length : undefined;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {count !== undefined && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-[350px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Tìm SKU, hãng, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={readyFilter}
            onChange={(e) => setReadyFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="all">Tất cả</option>
            <option value="ready">Sẵn sàng</option>
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button size="sm" onClick={handleAdd} className="bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> Thêm mới
          </Button>
        </div>
      </div>

      {/* Import Result Banner */}
      {importResult && (
        <Card className={`p-4 mb-4 border-l-4 ${importResult.errors.length > 0 ? 'border-l-yellow-500 bg-yellow-50' : 'border-l-green-500 bg-green-50'}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-sm">
                {importResult.errors.length > 0 ? (
                  <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-yellow-600" /> Import có lỗi</span>
                ) : (
                  <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-600" /> Import thành công</span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Tổng: {importResult.total} · Mới: {importResult.created} · Cập nhật: {importResult.updated} · Bỏ qua: {importResult.skipped}
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="text-xs text-red-600">Dòng {err.row}: {err.error}</div>
                  ))}
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>×</Button>
          </div>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">{search ? 'Không tìm thấy kết quả' : 'Chưa có sản phẩm nào'}</p>
          <p className="text-xs text-gray-400 mb-4">
            {search ? 'Thử từ khoá khác' : 'Thêm sản phẩm hoặc import từ Excel'}
          </p>
          {!search && (
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={handleAdd}>
                <Plus className="w-4 h-4 mr-1" /> Thêm mới
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Import Excel
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">Ready</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                        {col.key === 'inverter_type' ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {String(item[col.key] || '—')}
                          </Badge>
                        ) : (
                          <span className={col.type === 'price' ? 'font-mono text-xs' : ''}>
                            {formatCell(item[col.key], col.type)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      {item.ready ? (
                        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-3 py-2 border-t text-xs text-gray-500">
            {filteredItems.length} sản phẩm
            {readyFilter === 'ready' && ' (chỉ hiện sẵn sàng)'}
            {search && ` · Tìm: "${search}"`}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Chỉnh sửa' : 'Thêm mới'} — {TABS.find((t) => t.key === activeTab)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {FORM_FIELDS[activeTab].map((field) => {
              // Hide battery fields for non-HYBRID inverters
              if (
                activeTab === 'inverters' &&
                (field.key === 'battery_voltage' || field.key === 'max_charge_current') &&
                formData.inverter_type !== 'HYBRID'
              ) {
                return null;
              }

              return (
                <div key={field.key} className={field.key === 'sku' ? 'col-span-2' : ''}>
                  <Label className="text-xs text-gray-600">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {field.type === 'select' ? (
                    <Select
                      value={formData[field.key] || ''}
                      onValueChange={(v) => setFormData({ ...formData, [field.key]: v })}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue placeholder="Chọn..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      step={field.type === 'number' ? 'any' : undefined}
                      value={formData[field.key] || ''}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="h-9 mt-1"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <strong>Ready</strong> được tính tự động bởi hệ thống dựa trên specs đã nhập đủ hay chưa.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editingItem ? 'Cập nhật' : 'Thêm mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-4">
            Bạn có chắc muốn xoá sản phẩm này? Hành động này có thể hoàn tác.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Huỷ</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

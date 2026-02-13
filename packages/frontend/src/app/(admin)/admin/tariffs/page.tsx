'use client';

import { useEffect, useState } from 'react';
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
  Plus, Zap, Trash2, Pencil, Star, Loader2, Layers, Minus,
} from 'lucide-react';

interface TariffTier {
  tier_number: number;
  from_kwh: number;
  to_kwh: number | null;
  price_vnd: number;
}

interface Tariff {
  id: string;
  name: string;
  tariff_type: 'TIERED' | 'FLAT';
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  flat_rate_vnd: number | null;
  tiers: TariffTier[];
  created_at: string;
}

// Default EVN tiers 2024
const DEFAULT_EVN_TIERS: TariffTier[] = [
  { tier_number: 1, from_kwh: 0, to_kwh: 50, price_vnd: 1893 },
  { tier_number: 2, from_kwh: 51, to_kwh: 100, price_vnd: 1956 },
  { tier_number: 3, from_kwh: 101, to_kwh: 200, price_vnd: 2271 },
  { tier_number: 4, from_kwh: 201, to_kwh: 300, price_vnd: 2860 },
  { tier_number: 5, from_kwh: 301, to_kwh: 400, price_vnd: 3197 },
  { tier_number: 6, from_kwh: 401, to_kwh: null, price_vnd: 3302 },
];

function formatPrice(vnd: number): string {
  return vnd.toLocaleString('vi-VN');
}

function calcBill(tariff: Tariff, kwh: number): number {
  if (tariff.tariff_type === 'FLAT') return kwh * (tariff.flat_rate_vnd || 0);
  let total = 0;
  let remaining = kwh;
  const sorted = [...tariff.tiers].sort((a, b) => a.tier_number - b.tier_number);
  for (const tier of sorted) {
    if (remaining <= 0) break;
    const range = tier.to_kwh !== null ? tier.to_kwh - tier.from_kwh + 1 : remaining;
    const used = Math.min(remaining, range);
    total += used * tier.price_vnd;
    remaining -= used;
  }
  return Math.round(total);
}

export default function AdminTariffsPage() {
  const { toast } = useToast();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null);
  const [form, setForm] = useState({
    name: '',
    tariff_type: 'TIERED' as 'TIERED' | 'FLAT',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    is_default: false,
    flat_rate_vnd: '',
  });
  const [tiers, setTiers] = useState<TariffTier[]>([...DEFAULT_EVN_TIERS]);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Preview
  const [previewKwh, setPreviewKwh] = useState(400);

  useEffect(() => {
    loadTariffs();
  }, []);

  const loadTariffs = async () => {
    try {
      const { data } = await api.get<{ value: Tariff[] }>('/api/admin/tariffs');
      setTariffs(data.value || []);
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tải biểu giá', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingTariff(null);
    setForm({
      name: '', tariff_type: 'TIERED',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '', is_default: tariffs.length === 0, flat_rate_vnd: '',
    });
    setTiers([...DEFAULT_EVN_TIERS]);
    setDialogOpen(true);
  };

  const handleEdit = (t: Tariff) => {
    setEditingTariff(t);
    setForm({
      name: t.name,
      tariff_type: t.tariff_type,
      effective_from: t.effective_from?.split('T')[0] || '',
      effective_to: t.effective_to?.split('T')[0] || '',
      is_default: t.is_default,
      flat_rate_vnd: t.flat_rate_vnd ? String(t.flat_rate_vnd) : '',
    });
    setTiers(t.tiers.length > 0 ? [...t.tiers] : [...DEFAULT_EVN_TIERS]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.effective_from) {
      toast({ title: 'Thiếu thông tin', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        tariff_type: form.tariff_type,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        is_default: form.is_default,
        flat_rate_vnd: form.tariff_type === 'FLAT' ? parseInt(form.flat_rate_vnd) || null : null,
        tiers: form.tariff_type === 'TIERED' ? tiers : [],
      };

      if (editingTariff) {
        await api.put(`/api/admin/tariffs/${editingTariff.id}`, payload);
        toast({ title: 'Đã cập nhật biểu giá' });
      } else {
        await api.post('/api/admin/tariffs', payload);
        toast({ title: 'Đã tạo biểu giá' });
      }
      setDialogOpen(false);
      loadTariffs();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lưu', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/api/admin/tariffs/${deleteId}`);
      toast({ title: 'Đã xoá biểu giá' });
      setDeleteId(null);
      loadTariffs();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.post(`/api/admin/tariffs/${id}/default`);
      toast({ title: 'Đã đặt làm mặc định' });
      loadTariffs();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    }
  };

  // Tier management in dialog
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const newFrom = last ? (last.to_kwh !== null ? last.to_kwh + 1 : 0) : 0;
    setTiers([...tiers, { tier_number: tiers.length + 1, from_kwh: newFrom, to_kwh: null, price_vnd: 0 }]);
  };

  const removeTier = (idx: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier_number: i + 1 })));
  };

  const updateTierField = (idx: number, field: string, value: string) => {
    const updated = [...tiers];
    const tier = { ...updated[idx] };
    if (field === 'price_vnd') {
      tier.price_vnd = parseInt(value) || 0;
    } else if (field === 'from_kwh') {
      tier.from_kwh = parseInt(value) || 0;
    } else if (field === 'to_kwh') {
      tier.to_kwh = value === '' ? null : parseInt(value) || 0;
    }
    updated[idx] = tier;
    setTiers(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biểu giá điện</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý biểu giá điện EVN để tính ROI chính xác</p>
        </div>
        <Button onClick={handleAdd} className="bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Thêm biểu giá
        </Button>
      </div>

      {/* Tariff List */}
      {tariffs.length === 0 ? (
        <Card className="p-12 text-center">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">Chưa có biểu giá nào</p>
          <p className="text-xs text-gray-400 mb-4">Thêm biểu giá bậc thang EVN hoặc điện 1 giá</p>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1" /> Thêm biểu giá đầu tiên
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {tariffs.map((t) => {
            const bill400 = calcBill(t, 400);
            return (
              <Card key={t.id} className={`p-5 ${t.is_default ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      {t.is_default && (
                        <Badge className="bg-blue-100 text-blue-700 gap-1">
                          <Star className="w-3 h-3" /> Mặc định
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {t.tariff_type === 'TIERED' ? 'Bậc thang' : '1 giá'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Hiệu lực từ: {new Date(t.effective_from).toLocaleDateString('vi-VN')}
                      {t.effective_to && ` — ${new Date(t.effective_to).toLocaleDateString('vi-VN')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!t.is_default && (
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleSetDefault(t.id)}>
                        <Star className="w-3 h-3 mr-1" /> Mặc định
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(t)}>
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Tier table or flat rate */}
                {t.tariff_type === 'FLAT' ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <span className="text-2xl font-bold text-gray-900">{formatPrice(t.flat_rate_vnd || 0)}</span>
                    <span className="text-sm text-gray-500 ml-1">VNĐ/kWh</span>
                  </div>
                ) : t.tiers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="pb-2 font-medium">Bậc</th>
                          <th className="pb-2 font-medium">Từ (kWh)</th>
                          <th className="pb-2 font-medium">Đến (kWh)</th>
                          <th className="pb-2 font-medium text-right">Giá (VNĐ/kWh)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...t.tiers].sort((a, b) => a.tier_number - b.tier_number).map((tier) => (
                          <tr key={tier.tier_number} className="border-b last:border-0">
                            <td className="py-1.5">
                              <Badge variant="secondary" className="text-[10px]">Bậc {tier.tier_number}</Badge>
                            </td>
                            <td className="py-1.5">{tier.from_kwh}</td>
                            <td className="py-1.5">{tier.to_kwh !== null ? tier.to_kwh : '∞'}</td>
                            <td className="py-1.5 text-right font-mono">{formatPrice(tier.price_vnd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* Quick preview */}
                <div className="mt-3 pt-3 border-t flex items-center gap-3 text-sm">
                  <span className="text-gray-500">Ước tính 400 kWh/tháng:</span>
                  <span className="font-semibold text-blue-600">{formatPrice(bill400)} VNĐ</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTariff ? 'Chỉnh sửa biểu giá' : 'Thêm biểu giá mới'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Tên biểu giá <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Biểu giá bậc thang EVN 2024"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Loại</Label>
                <Select value={form.tariff_type} onValueChange={(v) => setForm({ ...form, tariff_type: v as 'TIERED' | 'FLAT' })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TIERED">Bậc thang (EVN)</SelectItem>
                    <SelectItem value="FLAT">Điện 1 giá</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ngày hiệu lực <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="rounded border-gray-300"
                id="is-default"
              />
              <Label htmlFor="is-default" className="cursor-pointer text-sm">Đặt làm biểu giá mặc định</Label>
            </div>

            {/* Flat rate */}
            {form.tariff_type === 'FLAT' && (
              <div>
                <Label>Giá điện (VNĐ/kWh)</Label>
                <Input
                  type="number"
                  value={form.flat_rate_vnd}
                  onChange={(e) => setForm({ ...form, flat_rate_vnd: e.target.value })}
                  placeholder="2500"
                  className="mt-1"
                />
              </div>
            )}

            {/* Tiered pricing */}
            {form.tariff_type === 'TIERED' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1"><Layers className="w-4 h-4" /> Bảng giá bậc thang</Label>
                  <Button variant="outline" size="sm" onClick={addTier}>
                    <Plus className="w-3 h-3 mr-1" /> Thêm bậc
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Bậc</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Từ (kWh)</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Đến (kWh)</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Giá (VNĐ/kWh)</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="px-3 py-1.5 text-gray-500 font-medium">{tier.tier_number}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              value={tier.from_kwh}
                              onChange={(e) => updateTierField(idx, 'from_kwh', e.target.value)}
                              className="h-8 w-20"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              value={tier.to_kwh !== null ? tier.to_kwh : ''}
                              onChange={(e) => updateTierField(idx, 'to_kwh', e.target.value)}
                              placeholder="∞"
                              className="h-8 w-20"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="number"
                              value={tier.price_vnd}
                              onChange={(e) => updateTierField(idx, 'price_vnd', e.target.value)}
                              className="h-8 w-24"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeTier(idx)} disabled={tiers.length <= 1}>
                              <Minus className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Preview */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-3">
                <Label className="text-sm">Thử tính:</Label>
                <Input
                  type="number"
                  value={previewKwh}
                  onChange={(e) => setPreviewKwh(parseInt(e.target.value) || 0)}
                  className="h-8 w-24 bg-white"
                />
                <span className="text-sm text-gray-600">kWh/tháng →</span>
                <span className="font-bold text-blue-700">
                  {formatPrice(calcBill({
                    ...({} as Tariff),
                    tariff_type: form.tariff_type,
                    flat_rate_vnd: parseInt(form.flat_rate_vnd) || 0,
                    tiers: form.tariff_type === 'TIERED' ? tiers : [],
                  }, previewKwh))} VNĐ
                </span>
              </div>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingTariff ? 'Cập nhật' : 'Tạo biểu giá'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Xoá biểu giá?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-4">Biểu giá và tất cả bậc giá sẽ bị xoá vĩnh viễn.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Huỷ</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

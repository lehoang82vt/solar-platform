'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Sun, Home } from 'lucide-react';

interface Roof {
  id: string;
  roof_index: number;
  azimuth: number;
  tilt: number;
  area: number;
  usable_pct: number;
  pvgis_avg_kwh?: number | null;
}

interface RoofFormProps {
  projectId: string;
  onChanged?: () => void;
}

const DEFAULT_ROOF = { roof_index: 1, azimuth: 180, tilt: 15, area: 50, usable_pct: 80 };

export default function RoofForm({ projectId, onChanged }: RoofFormProps) {
  const { toast } = useToast();
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoof, setEditingRoof] = useState<Roof | null>(null);
  const [formData, setFormData] = useState(DEFAULT_ROOF);
  const [saving, setSaving] = useState(false);
  const [fetchingPvgis, setFetchingPvgis] = useState<string | null>(null);

  useEffect(() => { loadRoofs(); }, [projectId]);

  const loadRoofs = async () => {
    try {
      const { data } = await api.get<{ roofs?: Roof[]; value?: Roof[] }>(`/api/projects/${projectId}/roofs`);
      setRoofs(data.roofs || data.value || (Array.isArray(data) ? data as unknown as Roof[] : []));
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được danh sách mái', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingRoof(null);
    setFormData({ ...DEFAULT_ROOF, roof_index: roofs.length + 1 });
    setDialogOpen(true);
  };

  const openEdit = (roof: Roof) => {
    setEditingRoof(roof);
    setFormData({ roof_index: roof.roof_index, azimuth: roof.azimuth, tilt: roof.tilt, area: roof.area, usable_pct: roof.usable_pct });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRoof) {
        await api.put(`/api/projects/${projectId}/roofs/${editingRoof.id}`, formData);
        toast({ title: 'Đã cập nhật', description: 'Mái đã được cập nhật' });
      } else {
        await api.post(`/api/projects/${projectId}/roofs`, formData);
        toast({ title: 'Đã thêm', description: 'Mái mới đã được thêm' });
      }
      setDialogOpen(false);
      loadRoofs();
      onChanged?.();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lưu thông tin mái', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roofId: string) => {
    if (!confirm('Xác nhận xoá mái này?')) return;
    try {
      await api.delete(`/api/projects/${projectId}/roofs/${roofId}`);
      toast({ title: 'Đã xoá', description: 'Mái đã được xoá' });
      loadRoofs();
      onChanged?.();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể xoá mái', variant: 'destructive' });
    }
  };

  const fetchPvgis = async (roofId: string) => {
    setFetchingPvgis(roofId);
    try {
      await api.post(`/api/projects/${projectId}/pvgis`, { roof_id: roofId });
      toast({ title: 'PVGIS', description: 'Đã lấy dữ liệu bức xạ mặt trời' });
      loadRoofs();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể lấy dữ liệu PVGIS', variant: 'destructive' });
    } finally {
      setFetchingPvgis(null);
    }
  };

  if (loading) {
    return <Card className="p-6"><div className="text-center text-gray-500">Đang tải...</div></Card>;
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Mái nhà ({roofs.length})</h3>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Thêm mái
          </Button>
        </div>

        {roofs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Chưa có mái nào. Nhấn &quot;Thêm mái&quot; để bắt đầu.</p>
        ) : (
          <div className="space-y-3">
            {roofs.map((roof) => (
              <div key={roof.id} className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">Mái #{roof.roof_index}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {roof.area}m² · Hướng {roof.azimuth}° · Nghiêng {roof.tilt}° · SD {roof.usable_pct}%
                  </div>
                  {roof.pvgis_avg_kwh != null && (
                    <Badge className="mt-1 bg-green-100 text-green-700">
                      <Sun className="w-3 h-3 mr-1" /> PVGIS: {roof.pvgis_avg_kwh} kWh/m²/ngày
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPvgis(roof.id)}
                    disabled={fetchingPvgis === roof.id}
                  >
                    <Sun className="w-4 h-4 mr-1" />
                    {fetchingPvgis === roof.id ? 'Đang lấy...' : 'PVGIS'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(roof)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(roof.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoof ? 'Sửa mái' : 'Thêm mái mới'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">Diện tích (m²)</label>
              <Input type="number" min="1" value={formData.area} onChange={(e) => setFormData({ ...formData, area: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tỷ lệ sử dụng (%)</label>
              <Input type="number" min="1" max="100" value={formData.usable_pct} onChange={(e) => setFormData({ ...formData, usable_pct: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hướng (°) 0=Bắc, 180=Nam</label>
              <Input type="number" min="0" max="360" value={formData.azimuth} onChange={(e) => setFormData({ ...formData, azimuth: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Độ nghiêng (°)</label>
              <Input type="number" min="0" max="90" value={formData.tilt} onChange={(e) => setFormData({ ...formData, tilt: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

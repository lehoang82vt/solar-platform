'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Sun, Home, Navigation, Loader2 } from 'lucide-react';

interface Roof {
  id: string;
  roof_index: number;
  azimuth: number;
  tilt: number;
  area: number;
  usable_pct: number;
  pvgis_avg_kwh?: number | null;
  pvgis_avg?: number | null;
  pvgis_min_month?: number | null;
  pvgis_min_value?: number | null;
  pvgis_source?: string | null;
}

interface RoofFormProps {
  projectId: string;
  hasCoordinates?: boolean;
  onChanged?: () => void;
}

const DEFAULT_ROOF = { roof_index: 1, azimuth: 180, tilt: 15, area: 50, usable_pct: 80 };

function getCompassLabel(azimuth: number): string {
  if (azimuth >= 337.5 || azimuth < 22.5) return 'Bắc';
  if (azimuth < 67.5) return 'Đông Bắc';
  if (azimuth < 112.5) return 'Đông';
  if (azimuth < 157.5) return 'Đông Nam';
  if (azimuth < 202.5) return 'Nam';
  if (azimuth < 247.5) return 'Tây Nam';
  if (azimuth < 292.5) return 'Tây';
  return 'Tây Bắc';
}

export default function RoofForm({ projectId, hasCoordinates = false, onChanged }: RoofFormProps) {
  const { toast } = useToast();
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoof, setEditingRoof] = useState<Roof | null>(null);
  const [formData, setFormData] = useState(DEFAULT_ROOF);
  const [usablePctSlider, setUsablePctSlider] = useState(80);
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
    setUsablePctSlider(80);
    setDialogOpen(true);
  };

  const openEdit = (roof: Roof) => {
    setEditingRoof(roof);
    setFormData({ roof_index: roof.roof_index, azimuth: roof.azimuth, tilt: roof.tilt, area: roof.area, usable_pct: roof.usable_pct });
    setUsablePctSlider(roof.usable_pct);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = { ...formData, usable_pct: usablePctSlider };
    setSaving(true);
    try {
      if (editingRoof) {
        await api.put(`/api/projects/${projectId}/roofs/${editingRoof.id}`, payload);
        toast({ title: 'Đã cập nhật', description: 'Mái đã được cập nhật' });
      } else {
        await api.post(`/api/projects/${projectId}/roofs`, payload);
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
      const { data } = await api.post<{ source?: string }>(`/api/projects/${projectId}/roofs/${roofId}/pvgis`);
      const sourceLabel = data.source === 'NASA' ? 'NASA POWER' : data.source === 'DEFAULT' ? 'Mặc định VN' : 'PVGIS';
      toast({ title: 'Bức xạ', description: `Đã lấy dữ liệu từ ${sourceLabel}` });
      loadRoofs();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể lấy dữ liệu bức xạ',
        variant: 'destructive',
      });
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
          <p className="text-sm text-gray-500 text-center py-6">Chưa có mái nào. Nhấn &quot;Thêm mái&quot; để bắt đầu.</p>
        ) : (
          <div className="space-y-3">
            {roofs.map((roof) => (
              <div key={roof.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm">Mái #{roof.roof_index}</span>
                      <Badge variant="outline" className="text-xs">
                        <Navigation className="w-3 h-3 mr-1" style={{ transform: `rotate(${roof.azimuth}deg)` }} />
                        {getCompassLabel(roof.azimuth)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                      <span>{roof.area} m²</span>
                      <span>Hướng {roof.azimuth}°</span>
                      <span>Nghiêng {roof.tilt}°</span>
                      <span>SD {roof.usable_pct}%</span>
                    </div>
                    {(roof.pvgis_avg != null || roof.pvgis_avg_kwh != null) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className={`text-xs ${
                          roof.pvgis_source === 'PVGIS' ? 'bg-green-100 text-green-700' :
                          roof.pvgis_source === 'NASA' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          <Sun className="w-3 h-3 mr-1" />
                          {roof.pvgis_source || 'PVGIS'}: TB {roof.pvgis_avg ?? roof.pvgis_avg_kwh} kWh/m²/ngày
                        </Badge>
                        {roof.pvgis_min_value != null && roof.pvgis_min_month != null && (
                          <Badge variant="outline" className="text-xs text-gray-600">
                            Min: {roof.pvgis_min_value} (T{roof.pvgis_min_month})
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchPvgis(roof.id)}
                      disabled={fetchingPvgis === roof.id || !hasCoordinates}
                      title={!hasCoordinates ? 'Ghim vị trí trên bản đồ trước' : 'Lấy dữ liệu bức xạ'}
                    >
                      {fetchingPvgis === roof.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sun className="w-4 h-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(roof)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(roof.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoof ? 'Sửa mái' : 'Thêm mái mới'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Diện tích (m²)</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hướng (°)</label>
                <Input
                  type="number"
                  min="0"
                  max="360"
                  value={formData.azimuth}
                  onChange={(e) => setFormData({ ...formData, azimuth: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-gray-400 mt-1">{getCompassLabel(formData.azimuth)} · 0=Bắc, 180=Nam</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Độ nghiêng (°)</label>
              <Input
                type="number"
                min="0"
                max="90"
                value={formData.tilt}
                onChange={(e) => setFormData({ ...formData, tilt: parseFloat(e.target.value) || 0 })}
                className="max-w-[200px]"
              />
            </div>

            {/* Usable % slider */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Tỷ lệ sử dụng được: <span className="text-blue-600 font-bold">{usablePctSlider}%</span>
              </label>
              <div className="px-1">
                <Slider
                  value={[usablePctSlider]}
                  onValueChange={([val]) => setUsablePctSlider(val)}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Trừ bồn nước, lối đi, vật cản, sai số</p>
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

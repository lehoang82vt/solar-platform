'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, FolderPlus, Phone, User, MapPin, Calendar,
  Pencil, Check, X, Globe, Users, FileText, AlertTriangle,
} from 'lucide-react';

interface Lead {
  id: string;
  phone: string;
  customer_name?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  status: string;
  partner_code?: string;
  first_touch_partner?: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'RECEIVED', label: 'Mới nhận', color: 'bg-blue-100 text-blue-700' },
  { value: 'CONTACTED', label: 'Đã liên hệ', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'QUALIFIED', label: 'Đủ điều kiện', color: 'bg-green-100 text-green-700' },
  { value: 'LOST', label: 'Mất', color: 'bg-red-100 text-red-700' },
];

function getSourceBadge(lead: Lead) {
  if (lead.partner_code) return { label: 'Đối tác', color: 'bg-purple-100 text-purple-700', icon: Users };
  return { label: 'Trực tiếp', color: 'bg-gray-100 text-gray-600', icon: Globe };
}

function InlineEdit({ value, onSave, placeholder, type = 'text' }: {
  value: string;
  onSave: (val: string) => Promise<void>;
  placeholder: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          disabled={saving}
        />
        <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving} className="h-8 w-8 p-0">
          <Check className="w-4 h-4 text-green-600" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving} className="h-8 w-8 p-0">
          <X className="w-4 h-4 text-gray-400" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <span className={value ? 'font-medium' : 'text-gray-400 italic'}>
        {value || placeholder}
      </span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity">
        <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
      </button>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState(false);
  const [existingProjects, setExistingProjects] = useState<{ id: string; status: string; customer_name: string | null; created_at: string }[]>([]);

  const id = params.id as string;

  const loadLead = useCallback(async () => {
    try {
      const { data } = await api.get<Lead>(`/api/sales/leads/${id}`);
      setLead(data);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được thông tin lead', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { if (id) loadLead(); }, [id, loadLead]);

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;
    setUpdating(true);
    try {
      const { data } = await api.patch<Lead>(`/api/sales/leads/${id}`, { status: newStatus });
      setLead(data);
      toast({ title: 'Đã cập nhật', description: 'Trạng thái lead đã được thay đổi' });
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể cập nhật trạng thái', variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      const { data } = await api.patch<Lead>(`/api/sales/leads/${id}`, { [field]: value || null });
      setLead(data);
      toast({ title: 'Đã lưu', description: 'Thông tin đã được cập nhật' });
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể cập nhật', variant: 'destructive' });
      throw new Error('Update failed');
    }
  };

  const doCreateProject = async () => {
    if (!lead) return;
    setCreatingProject(true);
    setDuplicateDialog(false);
    try {
      const { data } = await api.post<{ id: string }>('/api/projects/from-lead', { lead_id: lead.id });
      toast({ title: 'Đã tạo dự án', description: 'Dự án đã được tạo từ lead thành công' });
      router.push(`/sales/projects/${data.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo dự án từ lead',
        variant: 'destructive',
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateProject = async () => {
    if (!lead) return;
    try {
      const { data } = await api.get<{ id: string; status: string; customer_name: string | null; created_at: string }[]>(`/api/leads/${lead.id}/projects`);
      if (data.length > 0) {
        setExistingProjects(data);
        setDuplicateDialog(true);
      } else {
        doCreateProject();
      }
    } catch {
      doCreateProject();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Không tìm thấy lead.</p>
        <Button asChild variant="outline">
          <Link href="/sales/leads">Quay lại danh sách</Link>
        </Button>
      </div>
    );
  }

  const statusOption = STATUS_OPTIONS.find(s => s.value === lead.status);
  const source = getSourceBadge(lead);
  const SourceIcon = source.icon;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/leads">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Chi tiết Lead</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={statusOption?.color || 'bg-gray-100'}>
              {statusOption?.label || lead.status}
            </Badge>
            <Badge variant="outline" className={source.color}>
              <SourceIcon className="w-3 h-3 mr-1" />
              {source.label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-5 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Thông tin khách hàng
            </h2>
            <dl className="space-y-4">
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">Số điện thoại</dt>
                  <dd>
                    <InlineEdit
                      value={lead.phone || ''}
                      onSave={(val) => handleFieldUpdate('phone', val)}
                      placeholder="Chưa có SĐT"
                      type="tel"
                    />
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">Họ tên</dt>
                  <dd>
                    <InlineEdit
                      value={lead.customer_name || ''}
                      onSave={(val) => handleFieldUpdate('customer_name', val)}
                      placeholder="Chưa có tên"
                    />
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">Địa chỉ lắp đặt</dt>
                  <dd>
                    <InlineEdit
                      value={lead.customer_address || ''}
                      onSave={(val) => handleFieldUpdate('customer_address', val)}
                      placeholder="Chưa có địa chỉ"
                    />
                  </dd>
                </div>
              </div>

              {lead.partner_code && (
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                  <div className="flex-1">
                    <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">Mã đối tác</dt>
                    <dd className="font-medium">{lead.partner_code}</dd>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ngày tạo</dt>
                  <dd className="font-medium">{new Date(lead.created_at).toLocaleString('vi-VN')}</dd>
                </div>
              </div>
            </dl>
          </Card>

          {/* Notes */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              Ghi chú
            </h2>
            <NotesEditor
              value={lead.notes || ''}
              onSave={(val) => handleFieldUpdate('notes', val)}
            />
          </Card>
        </div>

        {/* Actions sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4">Hành động</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-2 block">Cập nhật trạng thái</label>
                <Select
                  value={lead.status}
                  onValueChange={handleStatusChange}
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${opt.color.split(' ')[0]}`} />
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                onClick={handleCreateProject}
                disabled={creatingProject || lead.status === 'LOST'}
                size="lg"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                {creatingProject ? 'Đang tạo...' : 'Tạo dự án từ lead'}
              </Button>

              {lead.status === 'LOST' && (
                <p className="text-xs text-gray-400 text-center">
                  Không thể tạo dự án khi lead đã mất
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Duplicate project warning dialog */}
      <Dialog open={duplicateDialog} onOpenChange={setDuplicateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-5 h-5" />
              Lead đã có {existingProjects.length} dự án
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-gray-600 mb-3">Bạn có chắc muốn tạo thêm dự án mới?</p>
            {existingProjects.map((p) => (
              <Link
                key={p.id}
                href={`/sales/projects/${p.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{p.customer_name || 'Chưa có tên'}</div>
                  <div className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString('vi-VN')}</div>
                </div>
                <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>
              </Link>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDuplicateDialog(false)}>Huỷ</Button>
            <Button onClick={doCreateProject} disabled={creatingProject} className="bg-yellow-600 hover:bg-yellow-700 text-white">
              <FolderPlus className="w-4 h-4 mr-2" />
              {creatingProject ? 'Đang tạo...' : 'Vẫn tạo thêm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotesEditor({ value, onSave }: { value: string; onSave: (val: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (text === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(text);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex min-h-[100px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          autoFocus
          disabled={saving}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setText(value); setEditing(false); }}>
            Hủy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[60px] p-3 rounded-lg bg-gray-50 text-sm text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-gray-400 italic">Nhấn để thêm ghi chú...</span>}
    </div>
  );
}

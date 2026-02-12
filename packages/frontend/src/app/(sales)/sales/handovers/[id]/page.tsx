'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, PenTool, CheckCircle, XCircle } from 'lucide-react';

interface HandoverDetail {
  id: string;
  contract_id: string;
  project_id: string;
  handover_type: string;
  handover_date: string;
  status: string;
  performed_by: string | null;
  accepted_by: string | null;
  checklist: Record<string, boolean> | null;
  notes: string | null;
  created_at: string;
  signed_at: string | null;
  completed_at: string | null;
}

const DEFAULT_CHECKLIST: Record<string, string> = {
  system_installed: 'Hệ thống đã lắp đặt',
  grid_connected: 'Đã kết nối lưới điện',
  customer_trained: 'Đã hướng dẫn khách hàng',
  documents_provided: 'Đã bàn giao tài liệu bảo hành',
  safety_checked: 'Đã kiểm tra an toàn',
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-gray-100 text-gray-700',
};

export default function HandoverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const handoverId = params.id as string;

  const [handover, setHandover] = useState<HandoverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadHandover(); }, [handoverId]);

  const loadHandover = async () => {
    try {
      // Try multiple API patterns since the v2 endpoint may structure differently
      const { data } = await api.get(`/api/handovers/v2`);
      const list = data.value || data.handovers || [];
      const found = (list as HandoverDetail[]).find((h: HandoverDetail) => h.id === handoverId);
      if (found) {
        setHandover(found);
      } else {
        setHandover(null);
      }
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được bàn giao', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!handover) return;
    setActionLoading(true);
    try {
      await api.post(`/api/projects/${handover.project_id}/handovers/${handoverId}/sign`);
      toast({ title: 'Đã ký', description: 'Bàn giao đã được ký' });
      loadHandover();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể ký', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!handover) return;
    if (!confirm('Xác nhận hoàn thành bàn giao?')) return;
    setActionLoading(true);
    try {
      await api.post(`/api/projects/${handover.project_id}/handovers/${handoverId}/complete`);
      toast({ title: 'Hoàn thành', description: 'Bàn giao đã hoàn thành' });
      loadHandover();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể hoàn thành', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!handover) return;
    if (!confirm('Xác nhận huỷ bàn giao?')) return;
    setActionLoading(true);
    try {
      await api.post(`/api/handovers/${handoverId}/cancel`);
      toast({ title: 'Đã huỷ', description: 'Bàn giao đã bị huỷ' });
      loadHandover();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể huỷ', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (!handover) {
    return <div className="text-center py-12"><p className="text-gray-500 mb-4">Không tìm thấy bàn giao</p><Button variant="outline" onClick={() => router.push('/sales/handovers')}>Quay lại</Button></div>;
  }

  const checklist = handover.checklist || {};

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sales/handovers')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Bàn giao - {handover.handover_type}</h1>
          <span className="text-sm text-gray-500">{new Date(handover.handover_date || handover.created_at).toLocaleDateString('vi-VN')}</span>
        </div>
        <Badge className={STATUS_COLORS[handover.status] || 'bg-gray-100 text-gray-700'}>{handover.status}</Badge>
      </div>

      {/* Checklist */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-4">Checklist bàn giao</h3>
        <div className="space-y-3">
          {Object.entries(DEFAULT_CHECKLIST).map(([key, label]) => {
            const checked = !!checklist[key];
            return (
              <div key={key} className="flex items-center gap-3">
                {checked ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                )}
                <span className={`text-sm ${checked ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Info */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">Thông tin</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Người thực hiện:</span> {handover.performed_by || '—'}</div>
          <div><span className="text-gray-500">Người nhận:</span> {handover.accepted_by || '—'}</div>
          {handover.signed_at && <div><span className="text-gray-500">Ký lúc:</span> {new Date(handover.signed_at).toLocaleString('vi-VN')}</div>}
          {handover.completed_at && <div><span className="text-gray-500">Hoàn thành lúc:</span> {new Date(handover.completed_at).toLocaleString('vi-VN')}</div>}
        </div>
      </Card>

      {handover.notes && (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-2">Ghi chú</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{handover.notes}</p>
        </Card>
      )}

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3">
          {handover.status !== 'COMPLETED' && handover.status !== 'CANCELLED' && (
            <>
              <Button onClick={handleSign} disabled={actionLoading}>
                <PenTool className="w-4 h-4 mr-2" />Ký bàn giao
              </Button>
              <Button onClick={handleComplete} disabled={actionLoading} variant="default">
                <CheckCircle className="w-4 h-4 mr-2" />Hoàn thành
              </Button>
              <Button onClick={handleCancel} disabled={actionLoading} variant="destructive">
                <XCircle className="w-4 h-4 mr-2" />Huỷ
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

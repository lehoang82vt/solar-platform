'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, PenTool, Package, ArrowRight, Wrench, CheckCircle } from 'lucide-react';

interface ContractDetail {
  id: string;
  contract_number: string;
  version: number;
  status: string;
  project_id: string;
  quote_id: string | null;
  total_vnd: number | null;
  deposit_percentage: number | null;
  deposit_vnd: number | null;
  final_payment_vnd: number | null;
  warranty_years: number | null;
  expected_start_date: string | null;
  expected_completion_date: string | null;
  customer_signed_at: string | null;
  company_signed_at: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_SIGNATURE: 'bg-yellow-100 text-yellow-700',
  SIGNED: 'bg-green-100 text-green-700',
  INSTALLING: 'bg-orange-100 text-orange-700',
  HANDOVER: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING_SIGNATURE: 'Chờ ký',
  SIGNED: 'Đã ký',
  INSTALLING: 'Đang lắp đặt',
  HANDOVER: 'Bàn giao',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const contractId = params.id as string;

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverForm, setHandoverForm] = useState({
    site_address: '',
    handover_date: new Date().toISOString().split('T')[0],
    representative_a: '',
    representative_b: '',
  });

  useEffect(() => { loadContract(); }, [contractId]);

  const loadContract = async () => {
    try {
      const { data } = await api.get<{ value?: ContractDetail; contract?: ContractDetail }>(`/contracts/${contractId}/v2`);
      setContract(data.value || data.contract || null);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được hợp đồng', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!contract) return;
    if (!confirm('Xác nhận ký hợp đồng này?')) return;
    setActionLoading(true);
    try {
      await api.post(`/projects/${contract.project_id}/contracts/${contractId}/sign`);
      toast({ title: 'Đã ký', description: 'Hợp đồng đã được ký thành công' });
      loadContract();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể ký hợp đồng', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransition = async (toStatus: string) => {
    if (!contract) return;
    const labels: Record<string, string> = {
      INSTALLING: 'chuyển sang Lắp đặt',
      HANDOVER: 'chuyển sang Bàn giao',
      COMPLETED: 'hoàn thành hợp đồng',
    };
    if (!confirm(`Xác nhận ${labels[toStatus] || toStatus}?`)) return;
    setActionLoading(true);
    try {
      await api.post(`/projects/${contract.project_id}/contracts/${contractId}/transition`, {
        to_status: toStatus,
      });
      toast({ title: 'Đã cập nhật', description: `Hợp đồng đã ${labels[toStatus]}` });
      loadContract();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể chuyển trạng thái', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateHandover = async () => {
    if (!contract) return;
    // Validate form
    if (!handoverForm.site_address || !handoverForm.representative_a || !handoverForm.representative_b) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng điền đầy đủ thông tin bàn giao', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await api.post(`/projects/${contract.project_id}/handovers`, {
        contract_id: contractId,
        acceptance_json: {
          site_address: handoverForm.site_address,
          handover_date: handoverForm.handover_date,
          representative_a: handoverForm.representative_a,
          representative_b: handoverForm.representative_b,
          checklist: [
            { name: 'Hệ thống đã lắp đặt', status: true },
            { name: 'Đã kết nối lưới điện', status: true },
            { name: 'Đã hướng dẫn khách hàng', status: false },
            { name: 'Đã bàn giao tài liệu bảo hành', status: false },
            { name: 'Đã kiểm tra an toàn', status: true },
          ],
        },
      });
      toast({ title: 'Đã tạo', description: 'Bàn giao đã được tạo thành công' });
      router.push('/sales/handovers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể tạo bàn giao', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const formatVnd = (v: number | null) => v ? `${Number(v).toLocaleString('vi-VN')} VNĐ` : '—';

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (!contract) {
    return <div className="text-center py-12"><p className="text-gray-500 mb-4">Không tìm thấy hợp đồng</p><Button variant="outline" onClick={() => router.push('/sales/contracts')}>Quay lại</Button></div>;
  }

  // Determine next transition
  const nextTransition: Record<string, { status: string; label: string; icon: React.ReactNode }> = {
    SIGNED: { status: 'INSTALLING', label: 'Bắt đầu lắp đặt', icon: <Wrench className="w-4 h-4 mr-2" /> },
    INSTALLING: { status: 'HANDOVER', label: 'Chuyển sang bàn giao', icon: <Package className="w-4 h-4 mr-2" /> },
    HANDOVER: { status: 'COMPLETED', label: 'Hoàn thành hợp đồng', icon: <CheckCircle className="w-4 h-4 mr-2" /> },
  };

  const transition = nextTransition[contract.status];

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sales/contracts')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.contract_number}</h1>
          <span className="text-sm text-gray-500">Phiên bản {contract.version}</span>
        </div>
        <Badge className={STATUS_COLORS[contract.status] || 'bg-gray-100 text-gray-700'}>
          {STATUS_LABELS[contract.status] || contract.status}
        </Badge>
      </div>

      {/* Status Flow */}
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between text-xs overflow-x-auto">
          {['DRAFT', 'SIGNED', 'INSTALLING', 'HANDOVER', 'COMPLETED'].map((s, i, arr) => {
            const isCurrent = contract.status === s;
            const isPast = arr.indexOf(contract.status) > i;
            return (
              <div key={s} className="flex items-center">
                <div className={`px-3 py-1 rounded-full font-medium whitespace-nowrap ${
                  isCurrent ? 'bg-blue-600 text-white' :
                  isPast ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {STATUS_LABELS[s] || s}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className={`w-4 h-4 mx-1 ${isPast ? 'text-green-400' : 'text-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">Thông tin hợp đồng</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Tổng giá trị:</span> <span className="font-bold text-green-600">{formatVnd(contract.total_vnd)}</span></div>
          <div><span className="text-gray-500">Tỷ lệ đặt cọc:</span> {contract.deposit_percentage || 30}%</div>
          <div><span className="text-gray-500">Tiền cọc:</span> {formatVnd(contract.deposit_vnd)}</div>
          <div><span className="text-gray-500">Thanh toán cuối:</span> {formatVnd(contract.final_payment_vnd)}</div>
          <div><span className="text-gray-500">Bảo hành:</span> {contract.warranty_years || 10} năm</div>
          <div><span className="text-gray-500">Ngày tạo:</span> {new Date(contract.created_at).toLocaleDateString('vi-VN')}</div>
          {contract.expected_start_date && <div><span className="text-gray-500">Dự kiến bắt đầu:</span> {new Date(contract.expected_start_date).toLocaleDateString('vi-VN')}</div>}
          {contract.expected_completion_date && <div><span className="text-gray-500">Dự kiến hoàn thành:</span> {new Date(contract.expected_completion_date).toLocaleDateString('vi-VN')}</div>}
        </div>
      </Card>

      {/* Signature Status */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">Trạng thái ký kết</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-gray-50">
            <div className="text-gray-500 mb-1">Khách hàng ký</div>
            <div className="font-medium">{contract.customer_signed_at ? new Date(contract.customer_signed_at).toLocaleString('vi-VN') : 'Chưa ký'}</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-50">
            <div className="text-gray-500 mb-1">Công ty ký</div>
            <div className="font-medium">{contract.company_signed_at ? new Date(contract.company_signed_at).toLocaleString('vi-VN') : 'Chưa ký'}</div>
          </div>
        </div>
      </Card>

      {contract.notes && (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-2">Ghi chú</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{contract.notes}</p>
        </Card>
      )}

      {/* Handover Form (shown when contract is in HANDOVER status) */}
      {showHandoverForm && contract.status === 'HANDOVER' && (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-4">Thông tin bàn giao</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Địa chỉ lắp đặt *</label>
              <Input
                value={handoverForm.site_address}
                onChange={(e) => setHandoverForm(prev => ({ ...prev, site_address: e.target.value }))}
                placeholder="Nhập địa chỉ lắp đặt"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Ngày bàn giao *</label>
              <Input
                type="date"
                value={handoverForm.handover_date}
                onChange={(e) => setHandoverForm(prev => ({ ...prev, handover_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Đại diện bên A (Công ty) *</label>
                <Input
                  value={handoverForm.representative_a}
                  onChange={(e) => setHandoverForm(prev => ({ ...prev, representative_a: e.target.value }))}
                  placeholder="Tên người đại diện"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Đại diện bên B (Khách hàng) *</label>
                <Input
                  value={handoverForm.representative_b}
                  onChange={(e) => setHandoverForm(prev => ({ ...prev, representative_b: e.target.value }))}
                  placeholder="Tên khách hàng"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreateHandover} disabled={actionLoading}>
                {actionLoading ? 'Đang tạo...' : 'Xác nhận tạo bàn giao'}
              </Button>
              <Button variant="outline" onClick={() => setShowHandoverForm(false)}>Huỷ</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3">
          {/* Sign button for DRAFT/PENDING_SIGNATURE */}
          {(contract.status === 'DRAFT' || contract.status === 'PENDING_SIGNATURE') && (
            <Button onClick={handleSign} disabled={actionLoading}>
              <PenTool className="w-4 h-4 mr-2" />{actionLoading ? 'Đang ký...' : 'Ký hợp đồng'}
            </Button>
          )}

          {/* Transition button */}
          {transition && contract.status !== 'HANDOVER' && (
            <Button onClick={() => handleTransition(transition.status)} disabled={actionLoading} variant="default">
              {transition.icon}
              {transition.label}
            </Button>
          )}

          {/* Complete button for HANDOVER */}
          {contract.status === 'HANDOVER' && (
            <>
              <Button onClick={() => setShowHandoverForm(true)} disabled={actionLoading || showHandoverForm}>
                <Package className="w-4 h-4 mr-2" />Tạo biên bản bàn giao
              </Button>
              <Button onClick={() => handleTransition('COMPLETED')} disabled={actionLoading} variant="default">
                <CheckCircle className="w-4 h-4 mr-2" />Hoàn thành hợp đồng
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

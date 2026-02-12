'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, PenTool, Package } from 'lucide-react';

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
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const contractId = params.id as string;

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

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
    setSigning(true);
    try {
      await api.post(`/projects/${contract.project_id}/contracts/${contractId}/sign`);
      toast({ title: 'Đã ký', description: 'Hợp đồng đã được ký thành công' });
      loadContract();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể ký hợp đồng', variant: 'destructive' });
    } finally {
      setSigning(false);
    }
  };

  const handleCreateHandover = async () => {
    if (!contract) return;
    try {
      await api.post(`/projects/${contract.project_id}/handovers`, {
        contract_id: contractId,
      });
      toast({ title: 'Đã tạo', description: 'Bàn giao đã được tạo' });
      router.push('/sales/handovers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể tạo bàn giao', variant: 'destructive' });
    }
  };

  const formatVnd = (v: number | null) => v ? `${Number(v).toLocaleString('vi-VN')} VNĐ` : '—';

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (!contract) {
    return <div className="text-center py-12"><p className="text-gray-500 mb-4">Không tìm thấy hợp đồng</p><Button variant="outline" onClick={() => router.push('/sales/contracts')}>Quay lại</Button></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sales/contracts')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.contract_number}</h1>
          <span className="text-sm text-gray-500">Phiên bản {contract.version}</span>
        </div>
        <Badge className={STATUS_COLORS[contract.status] || 'bg-gray-100 text-gray-700'}>{contract.status}</Badge>
      </div>

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

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3">
          {(contract.status === 'DRAFT' || contract.status === 'PENDING_SIGNATURE') && (
            <Button onClick={handleSign} disabled={signing}>
              <PenTool className="w-4 h-4 mr-2" />{signing ? 'Đang ký...' : 'Ký hợp đồng'}
            </Button>
          )}
          {contract.status === 'SIGNED' && (
            <Button onClick={handleCreateHandover}>
              <Package className="w-4 h-4 mr-2" />Tạo bàn giao
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

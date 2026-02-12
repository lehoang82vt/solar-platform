'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ScrollText } from 'lucide-react';

interface ContractItem {
  id: string;
  contract_number: string;
  status: string;
  total_vnd: number | null;
  customer_name: string | null;
  project_id: string | null;
  created_at: string;
  customer_signed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_SIGNATURE: 'bg-yellow-100 text-yellow-700',
  SIGNED: 'bg-green-100 text-green-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function ContractsPage() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadContracts(); }, []);

  const loadContracts = async () => {
    try {
      const { data } = await api.get<{ value?: ContractItem[]; contracts?: ContractItem[] }>('/contracts/v2');
      setContracts(data.value || data.contracts || []);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được danh sách hợp đồng', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Hợp đồng</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã HĐ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Giá trị</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Chưa có hợp đồng nào</p>
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{c.contract_number}</td>
                      <td className="px-6 py-4 text-sm">{c.customer_name || '—'}</td>
                      <td className="px-6 py-4"><Badge className={STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-700'}>{c.status}</Badge></td>
                      <td className="px-6 py-4 text-right text-sm font-semibold">{c.total_vnd ? `${Number(c.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{new Date(c.created_at).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4 text-right"><Link href={`/sales/contracts/${c.id}`}><Button variant="ghost" size="sm">Chi tiết</Button></Link></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

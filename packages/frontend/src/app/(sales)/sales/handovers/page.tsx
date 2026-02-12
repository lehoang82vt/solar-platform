'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Package } from 'lucide-react';

interface HandoverItem {
  id: string;
  contract_id: string;
  project_id: string;
  handover_type: string;
  handover_date: string;
  status: string;
  customer_name: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-gray-100 text-gray-700',
};

export default function HandoversPage() {
  const { toast } = useToast();
  const [handovers, setHandovers] = useState<HandoverItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHandovers(); }, []);

  const loadHandovers = async () => {
    try {
      const { data } = await api.get<{ value?: HandoverItem[]; handovers?: HandoverItem[] }>('/handovers/v2');
      setHandovers(data.value || data.handovers || []);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được danh sách bàn giao', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Bàn giao</h1>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày BG</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {handovers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Chưa có bàn giao nào</p>
                    </td>
                  </tr>
                ) : (
                  handovers.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium">{h.handover_type}</td>
                      <td className="px-6 py-4 text-sm">{h.customer_name || '—'}</td>
                      <td className="px-6 py-4"><Badge className={STATUS_COLORS[h.status] || 'bg-gray-100 text-gray-700'}>{h.status}</Badge></td>
                      <td className="px-6 py-4 text-sm text-gray-500">{new Date(h.handover_date || h.created_at).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4 text-right"><Link href={`/sales/handovers/${h.id}`}><Button variant="ghost" size="sm">Chi tiết</Button></Link></td>
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

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Search, FileText } from 'lucide-react';

interface QuoteItem {
  id: string;
  quote_number: string;
  status: string;
  total_vnd: number | null;
  customer_name: string | null;
  project_id: string | null;
  created_at: string;
  financial_snapshot?: { margin_pct?: number; gross_margin_pct?: number };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SENT: 'bg-blue-100 text-blue-700',
};

export default function SalesQuotesPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadQuotes(); }, [statusFilter]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get<{ value?: QuoteItem[]; quotes?: QuoteItem[] }>('/api/quotes/v2', { params });
      setQuotes(data.value || data.quotes || []);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được danh sách báo giá', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = search.trim()
    ? quotes.filter((q) =>
        q.quote_number.toLowerCase().includes(search.toLowerCase()) ||
        (q.customer_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : quotes;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Báo giá</h1>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Tìm theo mã BG, tên KH..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã báo giá</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Giá trị</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Không có báo giá nào</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{q.quote_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{q.customer_name || '—'}</td>
                      <td className="px-6 py-4">
                        <Badge className={STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-700'}>{q.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold">
                        {q.total_vnd ? `${Number(q.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{new Date(q.created_at).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/sales/quotes/${q.id}`}><Button variant="ghost" size="sm">Chi tiết</Button></Link>
                      </td>
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

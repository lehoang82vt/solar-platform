'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Send, Download, ScrollText, Trash2 } from 'lucide-react';

interface LineItem {
  id: string;
  item_type: string;
  description: string;
  sku: string | null;
  quantity: number;
  unit: string | null;
  unit_price_vnd: number;
  total_price_vnd: number;
}

interface QuoteDetail {
  id: string;
  quote_number: string;
  version: number;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  system_size_kwp: number | null;
  panel_count: number | null;
  subtotal_vnd: number | null;
  discount_vnd: number | null;
  tax_vnd: number | null;
  total_vnd: number | null;
  financial_snapshot: { margin_pct?: number; gross_margin_pct?: number } | null;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  line_items?: LineItem[];
  project_id?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SENT: 'bg-blue-100 text-blue-700',
};

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadQuote(); }, [quoteId]);

  const loadQuote = async () => {
    try {
      const { data } = await api.get<{ value?: QuoteDetail; quote?: QuoteDetail }>(`/api/quotes/${quoteId}/v2`);
      setQuote(data.value || data.quote || null);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được báo giá', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/quotes/${quoteId}/submit`);
      toast({ title: 'Đã gửi', description: 'Báo giá đã được gửi để phê duyệt' });
      loadQuote();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể gửi báo giá', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const response = await api.get(`/api/quotes/${quoteId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-${quote?.quote_number || quoteId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tải PDF', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Xác nhận xoá báo giá này?')) return;
    try {
      await api.delete(`/api/quotes/${quoteId}`);
      toast({ title: 'Đã xoá', description: 'Báo giá đã được xoá' });
      router.push('/sales/quotes');
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể xoá', variant: 'destructive' });
    }
  };

  const handleCreateContract = async () => {
    if (!quote?.project_id && !quote?.id) return;
    try {
      await api.post(`/api/quotes/${quoteId}/contracts`);
      toast({ title: 'Đã tạo', description: 'Hợp đồng đã được tạo từ báo giá' });
      router.push('/sales/contracts');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({ title: 'Lỗi', description: err.response?.data?.error || 'Không thể tạo hợp đồng', variant: 'destructive' });
    }
  };

  const formatVnd = (v: number | null) => v ? `${Number(v).toLocaleString('vi-VN')} VNĐ` : '—';

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (!quote) {
    return <div className="text-center py-12"><p className="text-gray-500 mb-4">Không tìm thấy báo giá</p><Button variant="outline" onClick={() => router.push('/sales/quotes')}>Quay lại</Button></div>;
  }

  const margin = quote.financial_snapshot?.margin_pct ?? quote.financial_snapshot?.gross_margin_pct;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sales/quotes')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{quote.quote_number}</h1>
          <span className="text-sm text-gray-500">Phiên bản {quote.version} · {new Date(quote.created_at).toLocaleDateString('vi-VN')}</span>
        </div>
        <Badge className={STATUS_COLORS[quote.status] || 'bg-gray-100 text-gray-700'}>{quote.status}</Badge>
      </div>

      {/* Customer Info */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">Thông tin khách hàng</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Tên:</span> {quote.customer_name || '—'}</div>
          <div><span className="text-gray-500">SĐT:</span> {quote.customer_phone || '—'}</div>
          <div><span className="text-gray-500">Email:</span> {quote.customer_email || '—'}</div>
          <div><span className="text-gray-500">Địa chỉ:</span> {quote.customer_address || '—'}</div>
        </div>
      </Card>

      {/* System Info */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">Hệ thống</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500">Công suất:</span> <span className="font-semibold">{quote.system_size_kwp || '—'} kWp</span></div>
          <div><span className="text-gray-500">Số tấm:</span> <span className="font-semibold">{quote.panel_count || '—'}</span></div>
          {margin != null && (
            <div>
              <span className="text-gray-500">Margin:</span>{' '}
              <span className={`font-semibold ${margin < 10 ? 'text-red-600' : 'text-green-600'}`}>{margin}%</span>
            </div>
          )}
          {quote.valid_until && (
            <div><span className="text-gray-500">Hiệu lực đến:</span> {new Date(quote.valid_until).toLocaleDateString('vi-VN')}</div>
          )}
        </div>
      </Card>

      {/* Line Items */}
      {quote.line_items && quote.line_items.length > 0 && (
        <Card className="mb-6">
          <div className="p-4 border-b"><h3 className="font-semibold">Chi tiết báo giá</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Hạng mục</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Mô tả</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">SL</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Đơn giá</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quote.line_items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm"><Badge variant="outline">{item.item_type}</Badge></td>
                    <td className="px-4 py-3 text-sm">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-right">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatVnd(item.unit_price_vnd)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">{formatVnd(item.total_price_vnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Totals */}
      <Card className="p-6 mb-6">
        <div className="space-y-2 text-sm max-w-xs ml-auto">
          <div className="flex justify-between"><span className="text-gray-500">Tạm tính:</span><span>{formatVnd(quote.subtotal_vnd)}</span></div>
          {quote.discount_vnd && <div className="flex justify-between"><span className="text-gray-500">Giảm giá:</span><span className="text-red-600">-{formatVnd(quote.discount_vnd)}</span></div>}
          {quote.tax_vnd && <div className="flex justify-between"><span className="text-gray-500">Thuế:</span><span>{formatVnd(quote.tax_vnd)}</span></div>}
          <div className="flex justify-between pt-2 border-t font-bold text-lg">
            <span>Tổng cộng:</span>
            <span className="text-green-600">{formatVnd(quote.total_vnd)}</span>
          </div>
        </div>
      </Card>

      {/* Notes */}
      {quote.notes && (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-2">Ghi chú</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </Card>
      )}

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3">
          {quote.status === 'DRAFT' && (
            <>
              <Button onClick={handleSubmit} disabled={submitting}>
                <Send className="w-4 h-4 mr-2" />{submitting ? 'Đang gửi...' : 'Gửi phê duyệt'}
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />Xoá
              </Button>
            </>
          )}
          {quote.status === 'APPROVED' && (
            <Button onClick={handleCreateContract}>
              <ScrollText className="w-4 h-4 mr-2" />Tạo hợp đồng
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="w-4 h-4 mr-2" />Tải PDF
          </Button>
        </div>
      </Card>
    </div>
  );
}

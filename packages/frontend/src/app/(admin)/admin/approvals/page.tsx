'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle } from 'lucide-react';

interface PendingQuote {
  id: string;
  status?: string;
  created_at?: string;
  quote_number?: string;
  price_total?: number;
  payload?: { price_total?: number; quote_number?: string };
  financial_snapshot?: { total_vnd?: number; margin_pct?: number; gross_margin_pct?: number };
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<PendingQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingQuotes();
  }, []);

  const loadPendingQuotes = async () => {
    try {
      const { data } = await api.get<{ quotes: PendingQuote[] }>('/api/quotes/pending');
      setQuotes(data.quotes || []);
    } catch (error) {
      console.error('Failed to load pending quotes', error);
      toast({
        title: 'Lỗi',
        description: 'Không tải được danh sách báo giá chờ duyệt',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id: string) => {
    try {
      await api.post(`/api/quotes/${id}/approve`);
      toast({ title: 'Đã duyệt', description: 'Báo giá đã được phê duyệt' });
      loadPendingQuotes();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể duyệt',
        variant: 'destructive',
      });
    }
  };

  const reject = async (id: string) => {
    const reason = prompt('Lý do từ chối:');
    if (reason === null) return;
    try {
      await api.post(`/api/quotes/${id}/reject`, { reason: reason || '' });
      toast({ title: 'Đã từ chối', description: 'Báo giá đã bị từ chối' });
      loadPendingQuotes();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể từ chối',
        variant: 'destructive',
      });
    }
  };

  const getTotalVnd = (q: PendingQuote) =>
    q.price_total ??
    q.financial_snapshot?.total_vnd ??
    (q.payload as { price_total?: number } | undefined)?.price_total ??
    0;

  const getMarginPct = (q: PendingQuote) =>
    q.financial_snapshot?.margin_pct ?? q.financial_snapshot?.gross_margin_pct ?? null;

  const getQuoteNumber = (q: PendingQuote) =>
    q.quote_number ?? (q.payload as { quote_number?: string } | undefined)?.quote_number ?? `#${q.id.slice(0, 8)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Phê duyệt báo giá</h1>

      {quotes.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          Không có báo giá nào chờ duyệt
        </Card>
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => {
            const totalVnd = getTotalVnd(quote);
            const marginPct = getMarginPct(quote);
            return (
              <Card key={quote.id} className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                      <h3 className="font-bold text-lg">{getQuoteNumber(quote)}</h3>
                      <Badge>{quote.status ?? 'PENDING_APPROVAL'}</Badge>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <dt className="text-gray-500">Tổng giá trị</dt>
                        <dd className="font-bold text-green-600">
                          {totalVnd ? `${Number(totalVnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Margin</dt>
                        <dd className={marginPct != null && marginPct < 10 ? 'text-red-600 font-bold' : ''}>
                          {marginPct != null ? `${marginPct}%` : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Ngày tạo</dt>
                        <dd>
                          {quote.created_at
                            ? new Date(quote.created_at).toLocaleDateString('vi-VN')
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button onClick={() => approve(quote.id)} variant="default" size="sm" className="touch-manipulation">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Duyệt
                    </Button>
                    <Button onClick={() => reject(quote.id)} variant="destructive" size="sm" className="touch-manipulation">
                      <XCircle className="w-4 h-4 mr-2" />
                      Từ chối
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

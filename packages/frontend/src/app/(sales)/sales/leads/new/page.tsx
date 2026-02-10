'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

export default function NewLeadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post<{ id: string }>('/api/sales/leads', {
        phone: phone.trim(),
      });
      toast({
        title: 'Đã thêm lead',
        description: 'Lead đã được tạo thành công',
      });
      router.push(`/sales/leads/${data.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo lead',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/leads">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Thêm lead</h1>
      </div>

      <Card className="p-6 max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              className="mt-2"
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!phone.trim() || loading}>
              {loading ? 'Đang tạo...' : 'Tạo lead'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/sales/leads">Hủy</Link>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

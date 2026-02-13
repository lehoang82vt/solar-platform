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
import { ArrowLeft, UserPlus, Phone, MapPin, User, FileText } from 'lucide-react';

export default function NewLeadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập số điện thoại', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<{ id: string }>('/api/sales/leads', {
        phone: phone.trim(),
        customer_name: customerName.trim() || undefined,
        customer_address: customerAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({
        title: 'Đã tạo lead',
        description: 'Lead mới đã được tạo thành công',
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thêm lead mới</h1>
          <p className="text-sm text-gray-500 mt-1">Nhập thông tin khách hàng tiềm năng</p>
        </div>
      </div>

      <Card className="p-6 max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Phone - Required */}
          <div>
            <Label htmlFor="phone" className="flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 text-blue-500" />
              Số điện thoại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              required
            />
          </div>

          {/* Customer name - Optional */}
          <div>
            <Label htmlFor="name" className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-green-500" />
              Họ tên khách hàng
            </Label>
            <Input
              id="name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          {/* Address - Optional */}
          <div>
            <Label htmlFor="address" className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              Địa chỉ lắp đặt
            </Label>
            <Input
              id="address"
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM"
            />
          </div>

          {/* Notes - Optional */}
          <div>
            <Label htmlFor="notes" className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-purple-500" />
              Ghi chú
            </Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú thêm (nguồn giới thiệu, yêu cầu đặc biệt...)"
              className="flex min-h-[80px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={!phone.trim() || loading} className="flex-1">
              <UserPlus className="w-4 h-4 mr-2" />
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

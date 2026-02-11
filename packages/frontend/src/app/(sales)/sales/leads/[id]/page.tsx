'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

interface Lead {
  id: string;
  phone: string;
  status: string;
  partner_code?: string;
  first_touch_partner?: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'RECEIVED', label: 'Mới' },
  { value: 'CONTACTED', label: 'Đã liên hệ' },
  { value: 'QUALIFIED', label: 'Đủ điều kiện' },
  { value: 'LOST', label: 'Mất' },
];

export default function LeadDetailPage() {
  const params = useParams();
  // const router = useRouter();  // Reserved for future use
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const id = params.id as string;

  useEffect(() => {
    if (id) loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      const { data } = await api.get<Lead>(`/api/sales/leads/${id}`);
      setLead(data);
    } catch (error) {
      console.error('Failed to load lead', error);
      toast({
        title: 'Lỗi',
        description: 'Không tải được thông tin lead',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;
    setUpdating(true);
    try {
      const { data } = await api.patch<Lead>(`/api/sales/leads/${id}`, {
        status: newStatus,
      });
      setLead(data);
      toast({
        title: 'Đã cập nhật',
        description: 'Trạng thái lead đã được thay đổi',
      });
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật trạng thái',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">Đang tải...</div>
    );
  }

  if (!lead) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Không tìm thấy lead.</p>
        <Button asChild variant="outline">
          <Link href="/sales/leads">Quay lại danh sách</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/leads">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Chi tiết Lead</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Thông tin</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Số điện thoại</dt>
                <dd className="font-medium">{lead.phone}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Trạng thái</dt>
                <dd>
                  <Badge>{lead.status}</Badge>
                </dd>
              </div>
              {lead.partner_code && (
                <div>
                  <dt className="text-sm text-gray-500">Mã đối tác</dt>
                  <dd className="font-medium">{lead.partner_code}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-gray-500">Ngày tạo</dt>
                <dd>
                  {new Date(lead.created_at).toLocaleString('vi-VN')}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div>
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Hành động</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-2 block">
                  Cập nhật trạng thái
                </label>
                <Select
                  value={lead.status}
                  onValueChange={handleStatusChange}
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" asChild>
                <Link href={`/sales/projects?from_lead=${lead.id}`}>
                  Tạo dự án
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface PartnerDashboard {
  leads_count: number;
  referral_code: string;
}

export default function PartnerDashboard() {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await api.get<PartnerDashboard>('/partner/dashboard');
      setDashboard(data);
    } catch (error) {
      // 401 when not partner auth - show placeholder
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  };

  const referralCode = dashboard?.referral_code ?? 'YOUR_CODE';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://solar-gpt.vn';
  const referralLink = `${baseUrl}?ref=${referralCode}`;

  const copyLink = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(referralLink).then(
      () => toast({ title: 'Đã copy', description: 'Link đã được copy vào clipboard' }),
      () => toast({ title: 'Lỗi', description: 'Không copy được', variant: 'destructive' })
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Partner Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Leads</p>
              <p className="text-2xl font-bold">{dashboard?.leads_count ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Hoa hồng chờ</p>
              <p className="text-2xl font-bold">0 VNĐ</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Tổng hoa hồng</p>
              <p className="text-2xl font-bold">0 VNĐ</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Mã giới thiệu của bạn</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-2">Chia sẻ link này để nhận hoa hồng:</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <code className="flex-1 bg-white border border-gray-200 px-4 py-2 rounded font-mono text-sm break-all">
              {referralLink}
            </code>
            <Button onClick={copyLink} className="shrink-0 touch-manipulation">
              Copy
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

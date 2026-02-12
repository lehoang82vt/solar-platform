'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Users, ClipboardList, FileText, TrendingUp } from 'lucide-react';

interface DashboardStats {
  leads_count: number;
  projects_count: number;
  quotes_count: number;
  conversion_rate: number;
  recent_leads?: { id: string; phone: string; status: string; created_at: string }[];
}

export default function SalesDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await api.get<DashboardStats>('/api/sales/dashboard');
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    );
  }

  const cards = [
    {
      title: 'Leads',
      value: stats?.leads_count ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Dự án',
      value: stats?.projects_count ?? 0,
      icon: ClipboardList,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Báo giá',
      value: stats?.quotes_count ?? 0,
      icon: FileText,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Tỷ lệ chuyển đổi',
      value: `${stats?.conversion_rate ?? 0}%`,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  const recentLeads = stats?.recent_leads ?? [];
  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return s;
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold">{card.value}</p>
                </div>
                <div className={`w-12 h-12 ${card.bgColor} rounded-full flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4">Leads gần đây</h2>
          {recentLeads.length === 0 ? (
            <div className="text-sm text-gray-500">Chưa có leads mới</div>
          ) : (
            <ul className="space-y-3">
              {recentLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                  <span className="font-medium">{lead.phone}</span>
                  <span className="text-gray-500">{formatDate(lead.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {recentLeads.length > 0 && (
            <Link href="/sales/leads" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
              Xem tất cả →
            </Link>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4">Hoạt động gần đây</h2>
          <div className="text-sm text-gray-500">Chưa có hoạt động</div>
        </Card>
      </div>
    </div>
  );
}

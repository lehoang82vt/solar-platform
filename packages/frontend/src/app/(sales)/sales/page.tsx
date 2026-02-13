'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  Users, ClipboardList, FileText, TrendingUp,
  Plus, ArrowRight, Phone, User, Clock,
} from 'lucide-react';

interface RecentLead {
  id: string;
  phone: string;
  customer_name?: string | null;
  status: string;
  created_at: string;
}

interface DashboardStats {
  leads_count: number;
  projects_count: number;
  quotes_count: number;
  conversion_rate: number;
  recent_leads?: RecentLead[];
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  LOST: 'Mất',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-yellow-100 text-yellow-700',
  QUALIFIED: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
};

export default function SalesDashboard() {
  const router = useRouter();
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

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return s;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const recentLeads = stats?.recent_leads ?? [];
  const pendingLeads = recentLeads.filter((l) => l.status === 'RECEIVED');

  const statCards = [
    {
      title: 'Leads',
      value: stats?.leads_count ?? 0,
      icon: Users,
      gradient: 'from-blue-500 to-blue-600',
      href: '/sales/leads',
    },
    {
      title: 'Dự án',
      value: stats?.projects_count ?? 0,
      icon: ClipboardList,
      gradient: 'from-green-500 to-emerald-600',
      href: '/sales/projects',
    },
    {
      title: 'Báo giá',
      value: stats?.quotes_count ?? 0,
      icon: FileText,
      gradient: 'from-purple-500 to-purple-600',
      href: '/sales/quotes',
    },
    {
      title: 'Tỷ lệ chuyển đổi',
      value: `${stats?.conversion_rate ?? 0}%`,
      icon: TrendingUp,
      gradient: 'from-orange-500 to-amber-600',
      href: '/sales/projects',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng quan hoạt động bán hàng</p>
        </div>
        <Button
          onClick={() => router.push('/sales/leads/new')}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Thêm lead
        </Button>
      </div>

      {/* Stat Cards - Clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <Card className="p-5 hover:shadow-lg transition-all duration-200 cursor-pointer group border-0 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                <div className="text-sm text-gray-500 mt-0.5">{card.title}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Leads gần đây</h2>
            <Link href="/sales/leads" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              Tất cả <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Chưa có leads nào</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/sales/leads/new')}>
                <Plus className="w-3 h-3 mr-1" /> Thêm lead đầu tiên
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/sales/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        {lead.customer_name ? (
                          <User className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Phone className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {lead.customer_name || lead.phone}
                        </div>
                        {lead.customer_name && (
                          <div className="text-xs text-gray-500">{lead.phone}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${LEAD_STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-700'}`}>
                        {LEAD_STATUS_LABELS[lead.status] || lead.status}
                      </Badge>
                      <span className="text-[11px] text-gray-400 hidden sm:inline">
                        {formatDate(lead.created_at)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Pending Leads (replaces stub "Recent Activity") */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Chờ xử lý</h2>
              {pendingLeads.length > 0 && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">{pendingLeads.length}</Badge>
              )}
            </div>
            <Link href="/sales/leads" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              Xem tất cả <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {pendingLeads.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Không có lead nào chờ xử lý</p>
              <p className="text-xs text-gray-400 mt-1">Leads mới với status RECEIVED sẽ hiện ở đây</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/sales/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <div>
                        <div className="font-medium text-sm">
                          {lead.customer_name || lead.phone}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(lead.created_at)}
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Xử lý
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

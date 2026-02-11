'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';

interface BIOverview {
  totalLeads: number;
  totalQuotes: number;
  totalProjects: number;
  totalRevenue: number;
  pendingApprovals: number;
  activeContracts: number;
  completedHandovers: number;
}

export default function AdminDashboardPage() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BIOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const response = await fetch(`${apiUrl}/bi/overview`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch overview data');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchOverview();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Đang tải dữ liệu...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-600">Lỗi: {error}</div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Tổng Leads',
      value: data?.totalLeads ?? 0,
      description: 'Khách hàng tiềm năng',
      icon: '👥',
    },
    {
      title: 'Báo giá',
      value: data?.totalQuotes ?? 0,
      description: 'Tổng số báo giá',
      icon: '📋',
    },
    {
      title: 'Dự án',
      value: data?.totalProjects ?? 0,
      description: 'Tổng số dự án',
      icon: '🏗️',
    },
    {
      title: 'Doanh thu',
      value: `${((data?.totalRevenue ?? 0) / 1000000).toFixed(0)}M`,
      description: 'VNĐ',
      icon: '💰',
    },
    {
      title: 'Chờ phê duyệt',
      value: data?.pendingApprovals ?? 0,
      description: 'Báo giá cần duyệt',
      icon: '⏳',
    },
    {
      title: 'Hợp đồng',
      value: data?.activeContracts ?? 0,
      description: 'Đang hoạt động',
      icon: '📄',
    },
    {
      title: 'Bàn giao',
      value: data?.completedHandovers ?? 0,
      description: 'Đã hoàn thành',
      icon: '✅',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Tổng quan hệ thống Solar-GPT
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <span className="text-2xl">{stat.icon}</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Chức năng đang phát triển...
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thống kê nhanh</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tỷ lệ chuyển đổi Lead → Quote</span>
                <span className="font-medium">
                  {data?.totalLeads ? Math.round((data.totalQuotes / data.totalLeads) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tỷ lệ chuyển đổi Quote → Project</span>
                <span className="font-medium">
                  {data?.totalQuotes ? Math.round((data.totalProjects / data.totalQuotes) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Doanh thu trung bình/Dự án</span>
                <span className="font-medium">
                  {data?.totalProjects && data?.totalRevenue
                    ? `${Math.round(data.totalRevenue / data.totalProjects / 1000000)}M VNĐ`
                    : '0M VNĐ'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

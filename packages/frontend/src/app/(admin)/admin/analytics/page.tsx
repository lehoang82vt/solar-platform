'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import {
  Users, ClipboardList, FileText, ScrollText, TrendingUp,
  ArrowRight, Loader2, DollarSign,
} from 'lucide-react';

interface BIOverview {
  leads_count?: number;
  projects_count?: number;
  quotes_count?: number;
  contracts_count?: number;
  revenue_total?: number;
  pending_approvals?: number;
  active_contracts?: number;
  completed_handovers?: number;
}

function formatVND(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} tr`;
  return n.toLocaleString('vi-VN');
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<BIOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: d } = await api.get<BIOverview>('/api/bi/overview');
      setData(d);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const leads = data?.leads_count || 0;
  const projects = data?.projects_count || 0;
  const quotes = data?.quotes_count || 0;
  const contracts = data?.contracts_count || data?.active_contracts || 0;
  const revenue = data?.revenue_total || 0;

  const leadToProject = leads > 0 ? Math.round((projects / leads) * 100) : 0;
  const projectToQuote = projects > 0 ? Math.round((quotes / projects) * 100) : 0;
  const quoteToContract = quotes > 0 ? Math.round((contracts / quotes) * 100) : 0;

  const funnelSteps = [
    { label: 'Leads', count: leads, icon: Users, color: 'bg-blue-500' },
    { label: 'Dự án', count: projects, icon: ClipboardList, color: 'bg-green-500', rate: leadToProject },
    { label: 'Báo giá', count: quotes, icon: FileText, color: 'bg-purple-500', rate: projectToQuote },
    { label: 'Hợp đồng', count: contracts, icon: ScrollText, color: 'bg-orange-500', rate: quoteToContract },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Phân tích</h1>
        <p className="text-sm text-gray-500 mt-1">Tổng quan hiệu suất kinh doanh</p>
      </div>

      {/* Revenue Card */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center gap-3 mb-1">
          <DollarSign className="w-5 h-5 opacity-80" />
          <span className="text-sm opacity-80">Tổng doanh thu</span>
        </div>
        <div className="text-3xl font-bold">{formatVND(revenue)} VNĐ</div>
        {projects > 0 && (
          <div className="text-sm opacity-70 mt-1">
            Trung bình {formatVND(Math.round(revenue / projects))} / dự án
          </div>
        )}
      </Card>

      {/* Conversion Funnel */}
      <h2 className="font-semibold text-gray-900 mb-4">Phễu chuyển đổi</h2>
      <div className="grid grid-cols-4 gap-3 mb-8">
        {funnelSteps.map((step, idx) => {
          const Icon = step.icon;
          const widthPct = leads > 0 ? Math.max(20, (step.count / leads) * 100) : 100;
          return (
            <div key={step.label} className="relative">
              <Card className="p-4 text-center">
                <div className={`w-10 h-10 rounded-full ${step.color} mx-auto mb-2 flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{step.count}</div>
                <div className="text-sm text-gray-500">{step.label}</div>
                {step.rate !== undefined && (
                  <div className="text-xs text-blue-600 mt-1 font-medium">{step.rate}%</div>
                )}
                {/* Bar */}
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-full transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </Card>
              {idx < funnelSteps.length - 1 && (
                <ArrowRight className="absolute -right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 z-10 hidden lg:block" />
              )}
            </div>
          );
        })}
      </div>

      {/* Key Metrics */}
      <h2 className="font-semibold text-gray-900 mb-4">Chỉ số quan trọng</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500 mb-1">Tỷ lệ Lead → Dự án</div>
          <div className="text-2xl font-bold text-gray-900">{leadToProject}%</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${leadToProject}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500 mb-1">Tỷ lệ Dự án → Báo giá</div>
          <div className="text-2xl font-bold text-gray-900">{projectToQuote}%</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${projectToQuote}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500 mb-1">Tỷ lệ Báo giá → HĐ</div>
          <div className="text-2xl font-bold text-gray-900">{quoteToContract}%</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${quoteToContract}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            <TrendingUp className="w-4 h-4" /> Chờ duyệt
          </div>
          <div className="text-2xl font-bold text-gray-900">{data?.pending_approvals || 0}</div>
          <div className="text-xs text-gray-400 mt-1">báo giá chờ phê duyệt</div>
        </Card>
      </div>
    </div>
  );
}

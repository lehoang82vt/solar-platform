'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import UsageForm from '@/components/forms/UsageForm';
import RoofForm from '@/components/forms/RoofForm';
import {
  ArrowLeft, ClipboardList, Cpu, FileText, ScrollText, Plus,
} from 'lucide-react';

interface ProjectDetail {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  status: string;
  monthly_kwh: number | null;
  day_usage_pct: number | null;
  night_kwh: number | null;
  storage_target_kwh: number | null;
  created_at: string;
  lead_id: string | null;
}

interface QuoteItem {
  id: string;
  quote_number: string;
  status: string;
  total_vnd: number | null;
  created_at: string;
}

interface ContractItem {
  id: string;
  contract_number: string;
  status: string;
  total_vnd: number | null;
  created_at: string;
}

const TABS = [
  { key: 'survey', label: 'Khảo sát', icon: ClipboardList },
  { key: 'equipment', label: 'Thiết bị', icon: Cpu },
  { key: 'quotes', label: 'Báo giá', icon: FileText },
  { key: 'contracts', label: 'Hợp đồng', icon: ScrollText },
] as const;

type TabKey = typeof TABS[number]['key'];

const STATUS_COLORS: Record<string, string> = {
  SURVEY_PENDING: 'bg-gray-100 text-gray-700',
  SURVEYING: 'bg-blue-100 text-blue-700',
  QUOTING: 'bg-purple-100 text-purple-700',
  NEGOTIATING: 'bg-yellow-100 text-yellow-700',
  CONTRACTED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DEMO: 'bg-slate-100 text-slate-600',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('survey');
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [creatingQuote, setCreatingQuote] = useState(false);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'quotes') loadQuotes();
    if (activeTab === 'contracts') loadContracts();
  }, [activeTab, projectId]);

  const loadProject = async () => {
    try {
      const { data } = await api.get<{ value: ProjectDetail }>(`/api/projects/${projectId}`);
      setProject(data.value);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được dự án', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadQuotes = async () => {
    try {
      const { data } = await api.get<{ value?: QuoteItem[]; quotes?: QuoteItem[] }>('/api/quotes/v2', {
        params: { project_id: projectId },
      });
      setQuotes(data.value || data.quotes || []);
    } catch { /* ignore */ }
  };

  const loadContracts = async () => {
    try {
      const { data } = await api.get<{ value?: ContractItem[]; contracts?: ContractItem[] }>(`/api/projects/${projectId}/contracts`);
      setContracts(data.value || data.contracts || []);
    } catch { /* ignore */ }
  };

  const handleCreateQuote = async () => {
    setCreatingQuote(true);
    try {
      const { data } = await api.post<{ id?: string; quote?: { id: string } }>(`/api/projects/${projectId}/quotes`);
      const quoteId = data.id || data.quote?.id;
      toast({ title: 'Đã tạo', description: 'Báo giá đã được tạo thành công' });
      if (quoteId) {
        router.push(`/sales/quotes/${quoteId}`);
      } else {
        loadQuotes();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo báo giá. Hãy chọn thiết bị trước.',
        variant: 'destructive',
      });
    } finally {
      setCreatingQuote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Không tìm thấy dự án</p>
        <Button variant="outline" onClick={() => router.push('/sales/projects')}>Quay lại</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sales/projects')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {project.customer_name || 'Dự án'}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            {project.customer_phone && <span>{project.customer_phone}</span>}
            {project.customer_address && <span>· {project.customer_address}</span>}
          </div>
        </div>
        <Badge className={STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}>
          {project.status}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'survey' && (
        <div className="space-y-6">
          <UsageForm
            projectId={projectId}
            initialData={{
              monthly_kwh: project.monthly_kwh,
              day_usage_pct: project.day_usage_pct,
            }}
            onSaved={loadProject}
          />
          <RoofForm projectId={projectId} onChanged={loadProject} />
        </div>
      )}

      {activeTab === 'equipment' && (
        <Card className="p-6">
          <div className="text-center py-8">
            <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Chọn thiết bị cho dự án</p>
            <Button onClick={() => router.push(`/sales/projects/${projectId}/equipment`)}>
              Chọn thiết bị
            </Button>
          </div>
        </Card>
      )}

      {activeTab === 'quotes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Báo giá ({quotes.length})</h3>
            <Button onClick={handleCreateQuote} disabled={creatingQuote} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {creatingQuote ? 'Đang tạo...' : 'Tạo báo giá'}
            </Button>
          </div>
          {quotes.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Chưa có báo giá nào</Card>
          ) : (
            <div className="space-y-3">
              {quotes.map((q) => (
                <Card key={q.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{q.quote_number}</div>
                      <div className="text-sm text-gray-500">
                        {q.total_vnd ? `${Number(q.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                        {' · '}
                        {new Date(q.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{q.status}</Badge>
                      <Link href={`/sales/quotes/${q.id}`}>
                        <Button variant="ghost" size="sm">Chi tiết</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'contracts' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Hợp đồng ({contracts.length})</h3>
          </div>
          {contracts.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Chưa có hợp đồng nào</Card>
          ) : (
            <div className="space-y-3">
              {contracts.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.contract_number}</div>
                      <div className="text-sm text-gray-500">
                        {c.total_vnd ? `${Number(c.total_vnd).toLocaleString('vi-VN')} VNĐ` : '—'}
                        {' · '}
                        {new Date(c.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{c.status}</Badge>
                      <Link href={`/sales/contracts/${c.id}`}>
                        <Button variant="ghost" size="sm">Chi tiết</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

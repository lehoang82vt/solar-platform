'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Search, FolderOpen } from 'lucide-react';

interface ProjectItem {
  id: string;
  customer_name: string | null;
  address: string | null;
  status: string;
  created_at: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  stats: { quotes_count: number; contracts_count: number; handovers_count: number };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'SURVEY_PENDING', label: 'Chờ khảo sát' },
  { value: 'SURVEYING', label: 'Đang khảo sát' },
  { value: 'QUOTING', label: 'Báo giá' },
  { value: 'NEGOTIATING', label: 'Thương lượng' },
  { value: 'CONTRACTED', label: 'Đã ký HĐ' },
  { value: 'INSTALLING', label: 'Lắp đặt' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'DEMO', label: 'Demo' },
];

const STATUS_COLORS: Record<string, string> = {
  SURVEY_PENDING: 'bg-gray-100 text-gray-700',
  SURVEYING: 'bg-blue-100 text-blue-700',
  QUOTING: 'bg-purple-100 text-purple-700',
  NEGOTIATING: 'bg-yellow-100 text-yellow-700',
  CONTRACTED: 'bg-green-100 text-green-700',
  INSTALLING: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DEMO: 'bg-slate-100 text-slate-600',
  NEW: 'bg-gray-100 text-gray-700',
};

export default function SalesProjectsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadProjects();
  }, [statusFilter]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get<{ value: ProjectItem[]; paging: { count: number } }>('/api/projects/v3', { params });
      setProjects(data.value || []);
      setTotalCount(data.paging?.count ?? 0);
    } catch {
      toast({ title: 'Lỗi', description: 'Không tải được danh sách dự án', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadProjects();
  };

  const filteredProjects = search.trim()
    ? projects
    : projects;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dự án</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} dự án</p>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Tìm theo tên KH, địa chỉ, SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-52">
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
          <Button variant="outline" onClick={handleSearch}>
            Tìm
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thống kê</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Không có dự án nào</p>
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {project.customer?.name || project.customer_name || 'Chưa có tên'}
                        </div>
                        {(project.customer?.phone || project.address) && (
                          <div className="text-sm text-gray-500">
                            {project.customer?.phone || project.address}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}>
                          {project.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span title="Báo giá">{project.stats.quotes_count} BG</span>
                        {' · '}
                        <span title="Hợp đồng">{project.stats.contracts_count} HĐ</span>
                        {' · '}
                        <span title="Bàn giao">{project.stats.handovers_count} BG</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(project.created_at).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link href={`/sales/projects/${project.id}`}>
                          <Button variant="ghost" size="sm">Chi tiết</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

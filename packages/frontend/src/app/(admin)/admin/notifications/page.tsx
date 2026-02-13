'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Bell, RefreshCw, Loader2, CheckCircle, XCircle, Clock,
  ToggleLeft, ToggleRight, Mail,
} from 'lucide-react';

interface NotificationLog {
  id: string;
  template_id: string;
  event_type: string;
  recipient: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface NotificationTemplate {
  id: string;
  event_type: string;
  name: string;
  active: boolean;
  channel: string;
}

type TabKey = 'logs' | 'templates';

const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  SENT: { label: 'Đã gửi', class: 'bg-green-100 text-green-700', icon: CheckCircle },
  FAILED: { label: 'Lỗi', class: 'bg-red-100 text-red-700', icon: XCircle },
  PENDING: { label: 'Chờ', class: 'bg-yellow-100 text-yellow-700', icon: Clock },
};

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('logs');
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
    else loadTemplates();
  }, [activeTab]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ value: NotificationLog[] }>('/api/admin/notifications/logs');
      setLogs(data.value || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ value: NotificationTemplate[] }>('/api/admin/notifications/templates');
      setTemplates(data.value || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const handleRetry = async (logId: string) => {
    setRetrying(logId);
    try {
      await api.post(`/api/admin/notifications/logs/${logId}/retry`);
      toast({ title: 'Đã gửi lại' });
      loadLogs();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  const handleToggle = async (templateId: string, active: boolean) => {
    try {
      await api.patch(`/api/admin/notifications/templates/${templateId}`, { active: !active });
      toast({ title: active ? 'Đã tắt template' : 'Đã bật template' });
      loadTemplates();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thông báo</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý mẫu và lịch sử gửi thông báo</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {[
          { key: 'logs' as TabKey, label: 'Lịch sử gửi', icon: Mail },
          { key: 'templates' as TabKey, label: 'Mẫu thông báo', icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : activeTab === 'logs' ? (
        /* Logs Tab */
        logs.length === 0 ? (
          <Card className="p-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Chưa có lịch sử gửi thông báo</p>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Thời gian</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Loại</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Người nhận</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">Trạng thái</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Lỗi</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const sc = STATUS_CONFIG[log.status] || STATUS_CONFIG.PENDING;
                  const Icon = sc.icon;
                  return (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-[10px]">{log.event_type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{log.recipient}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge className={`${sc.class} gap-1`}>
                          <Icon className="w-3 h-3" /> {sc.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-red-500 max-w-[200px] truncate">
                        {log.error_message || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {log.status === 'FAILED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => handleRetry(log.id)}
                            disabled={retrying === log.id}
                          >
                            {retrying === log.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RefreshCw className="w-3.5 h-3.5" />
                            }
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Templates Tab */
        templates.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Chưa có mẫu thông báo nào</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map((tmpl) => (
              <Card key={tmpl.id} className={`p-4 ${!tmpl.active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{tmpl.name || tmpl.event_type}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{tmpl.event_type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{tmpl.channel || 'email'}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(tmpl.id, tmpl.active)}
                    className={tmpl.active ? 'text-green-600' : 'text-gray-400'}
                  >
                    {tmpl.active ? (
                      <><ToggleRight className="w-6 h-6 mr-1" /> Bật</>
                    ) : (
                      <><ToggleLeft className="w-6 h-6 mr-1" /> Tắt</>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

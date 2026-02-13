'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, UserPlus, Shield, ShieldAlert, Lock, Unlock,
  Trash2, Pencil, Users, Key, Eye, EyeOff,
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'SALES';
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  ACTIVE: { label: 'Hoạt động', class: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Tạm khoá', class: 'bg-yellow-100 text-yellow-700' },
  INACTIVE: { label: 'Đã xoá', class: 'bg-gray-100 text-gray-500' },
};

const ROLE_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  ADMIN: { label: 'Admin', class: 'bg-blue-100 text-blue-700', icon: ShieldAlert },
  SALES: { label: 'Sales', class: 'bg-purple-100 text-purple-700', icon: Shield },
};

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', full_name: '', role: 'SALES', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', role: '' });
  const [saving, setSaving] = useState(false);

  // Reset password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Confirm dialogs
  const [suspendUser, setSuspendUser] = useState<UserItem | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data } = await api.get<{ value: UserItem[] }>('/api/admin/users');
      setUsers(data.value || []);
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tải danh sách', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.email || !createForm.full_name || !createForm.password) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng điền đầy đủ', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/admin/users', createForm);
      toast({ title: 'Đã tạo tài khoản' });
      setCreateOpen(false);
      setCreateForm({ email: '', full_name: '', role: 'SALES', password: '' });
      loadUsers();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Lỗi',
        description: err.response?.data?.error || 'Không thể tạo tài khoản',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${editingUser.id}`, editForm);
      toast({ title: 'Đã cập nhật' });
      setEditOpen(false);
      loadUsers();
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể cập nhật', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!suspendUser) return;
    const newStatus = suspendUser.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.patch(`/api/admin/users/${suspendUser.id}/status`, { status: newStatus });
      toast({ title: newStatus === 'SUSPENDED' ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản' });
      setSuspendUser(null);
      loadUsers();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    try {
      await api.delete(`/api/admin/users/${deleteUserId}`);
      toast({ title: 'Đã xoá tài khoản' });
      setDeleteUserId(null);
      loadUsers();
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    setResetting(true);
    try {
      await api.post(`/api/admin/users/${resetUserId}/reset-password`, { password: newPassword });
      toast({ title: 'Đã đặt lại mật khẩu' });
      setResetOpen(false);
      setNewPassword('');
      setResetUserId(null);
    } catch {
      toast({ title: 'Lỗi', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const openEdit = (user: UserItem) => {
    setEditingUser(user);
    setEditForm({ full_name: user.full_name, role: user.role });
    setEditOpen(true);
  };

  const openResetPassword = (userId: string) => {
    setResetUserId(userId);
    setNewPassword('');
    setResetOpen(true);
  };

  const activeUsers = users.filter((u) => u.status !== 'INACTIVE');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý tài khoản</h1>
          <p className="text-sm text-gray-500 mt-1">{activeUsers.length} tài khoản hoạt động</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 text-white hover:bg-blue-700">
          <UserPlus className="w-4 h-4 mr-2" /> Tạo tài khoản
        </Button>
      </div>

      {/* User list */}
      {activeUsers.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Chưa có tài khoản nào</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeUsers.map((user) => {
            const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG.ACTIVE;
            const roleCfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.SALES;
            const RoleIcon = roleCfg.icon;
            return (
              <Card key={user.id} className={`p-4 ${user.status === 'SUSPENDED' ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${roleCfg.class}`}>
                      <RoleIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{user.full_name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className={roleCfg.class}>{roleCfg.label}</Badge>
                    <Badge className={statusCfg.class}>{statusCfg.label}</Badge>
                    <div className="text-xs text-gray-400 hidden sm:block">
                      {new Date(user.created_at).toLocaleDateString('vi-VN')}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(user)} title="Sửa">
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openResetPassword(user.id)} title="Đặt lại mật khẩu">
                        <Key className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setSuspendUser(user)}
                        title={user.status === 'ACTIVE' ? 'Khoá' : 'Mở khoá'}
                      >
                        {user.status === 'ACTIVE' ? (
                          <Lock className="w-3.5 h-3.5 text-yellow-500" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5 text-green-500" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeleteUserId(user.id)} title="Xoá">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo tài khoản mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="nhân.viên@company.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Họ tên <span className="text-red-500">*</span></Label>
              <Input
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Vai trò</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES">Sales — Nhân viên bán hàng</SelectItem>
                  <SelectItem value="ADMIN">Admin — Quản trị viên</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mật khẩu tạm <span className="text-red-500">*</span></Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Tối thiểu 6 ký tự"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Nhân viên nên đổi mật khẩu sau lần đăng nhập đầu tiên</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Huỷ</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email</Label>
              <Input value={editingUser?.email || ''} disabled className="mt-1 bg-gray-50" />
            </div>
            <div>
              <Label>Họ tên</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Vai trò</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES">Sales</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Huỷ</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Mật khẩu mới</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Huỷ</Button>
            <Button onClick={handleResetPassword} disabled={resetting || newPassword.length < 6}>
              {resetting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Đặt lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Activate Confirm */}
      <Dialog open={!!suspendUser} onOpenChange={() => setSuspendUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {suspendUser?.status === 'ACTIVE' ? 'Khoá tài khoản?' : 'Mở khoá tài khoản?'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-4">
            {suspendUser?.status === 'ACTIVE'
              ? `Tài khoản ${suspendUser?.full_name} sẽ không thể đăng nhập cho đến khi được mở khoá.`
              : `Tài khoản ${suspendUser?.full_name} sẽ được phép đăng nhập trở lại.`
            }
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendUser(null)}>Huỷ</Button>
            <Button
              variant={suspendUser?.status === 'ACTIVE' ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
            >
              {suspendUser?.status === 'ACTIVE' ? 'Khoá' : 'Mở khoá'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xoá tài khoản?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-4">
            Tài khoản sẽ bị vô hiệu hoá vĩnh viễn. Hành động này không thể hoàn tác.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserId(null)}>Huỷ</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

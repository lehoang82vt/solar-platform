'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import MobileNav from '@/components/layout/MobileNav';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/sales', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales/leads', label: 'Leads', icon: Users },
  { href: '/sales/projects', label: 'Dự án', icon: ClipboardList },
  { href: '/sales/quotes', label: 'Báo giá', icon: FileText },
];

const mobileNavItems = navItems.map(({ href, label }) => ({ href, label }));

export default function SalesNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href="/sales" className="font-bold text-gray-900">
          Solar-GPT
        </Link>
        <MobileNav items={mobileNavItems} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Solar-GPT</h1>
        <p className="text-sm text-gray-500 mt-1">Sales Portal</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User info & logout */}
      <div className="p-4 border-t border-gray-200">
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Đăng xuất
        </Button>
      </div>
    </div>
    </>
  );
}

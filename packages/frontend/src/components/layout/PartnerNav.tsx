'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import MobileNav from '@/components/layout/MobileNav';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Share2,
} from 'lucide-react';

const navItems = [
  { href: '/partner', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/partner/leads', label: 'Leads', icon: Users },
  { href: '/partner/commissions', label: 'Hoa hồng', icon: DollarSign },
  { href: '/partner/referral', label: 'Giới thiệu', icon: Share2 },
];

const mobileNavItems = navItems.map(({ href, label }) => ({ href, label }));

export default function PartnerNav() {
  const pathname = usePathname();

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href="/partner" className="font-bold text-gray-900">Solar-GPT</Link>
        <MobileNav items={mobileNavItems} />
      </div>
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Solar-GPT</h1>
        <p className="text-sm text-gray-500 mt-1">Partner Portal</p>
      </div>

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
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
    </>
  );
}

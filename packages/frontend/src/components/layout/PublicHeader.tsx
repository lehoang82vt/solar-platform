'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import MobileNav from '@/components/layout/MobileNav';

const publicNavItems = [
  { href: '/#calculator', label: 'Tính toán' },
  { href: '/#features', label: 'Tính năng' },
  { href: '/#about', label: 'Về chúng tôi' },
  { href: '/login', label: 'Đăng nhập' },
];

export default function PublicHeader() {
  return (
    <header className="bg-white border-b border-gray-200 relative">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🌞</span>
          <span className="text-xl font-bold text-gray-900">Solar-GPT</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link href="/#calculator" className="text-gray-600 hover:text-gray-900">
            Tính toán
          </Link>
          <Link href="/#features" className="text-gray-600 hover:text-gray-900">
            Tính năng
          </Link>
          <Link href="/#about" className="text-gray-600 hover:text-gray-900">
            Về chúng tôi
          </Link>
          <Link href="/login">
            <Button variant="outline">Đăng nhập</Button>
          </Link>
        </nav>

        <div className="md:hidden">
          <MobileNav items={publicNavItems} />
        </div>
      </div>
    </header>
  );
}

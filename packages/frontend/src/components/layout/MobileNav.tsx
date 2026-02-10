'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MobileNavItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MobileNavProps {
  items: MobileNavItem[];
  className?: string;
}

export default function MobileNav({ items, className }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('md:hidden', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="touch-manipulation"
        aria-expanded={open}
        aria-label={open ? 'Đóng menu' : 'Mở menu'}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border-b border-gray-200 shadow-lg p-4">
          <nav className="space-y-1" role="navigation" aria-label="Menu chính">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-3 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

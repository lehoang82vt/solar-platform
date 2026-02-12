'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import SalesNav from '@/components/layout/SalesNav';

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Wait for zustand persist to hydrate
    const timer = setTimeout(() => {
      setMounted(true);
      setChecking(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const isAuth = isAuthenticated() || !!token;
    
    if (!isAuth) {
      router.push('/login');
      return;
    }
    
    const role = user?.role?.toLowerCase();
    if (role !== 'sales' && role !== 'admin' && role !== 'super_admin') {
      router.push('/');
    }
  }, [mounted, isAuthenticated, user, router]);

  if (checking || !mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const isAuth = isAuthenticated() || !!token;
  const role = user?.role?.toLowerCase();
  
  if (!isAuth || (role !== 'sales' && role !== 'admin' && role !== 'super_admin')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <SalesNav />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="container mx-auto px-4 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

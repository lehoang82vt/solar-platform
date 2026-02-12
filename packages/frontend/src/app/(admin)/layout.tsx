'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import AdminNav from '@/components/layout/AdminNav';
import { LoadingPage } from '@/components/ui/loading';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, hasRole, user } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for hydration
    const checkAuth = () => {
      if (typeof window === 'undefined') return;
      
      setIsChecking(false);
      
      if (!isAuthenticated()) {
        router.push('/login');
        return;
      }
      
      const userRole = user?.role?.toLowerCase();
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        router.push('/sales');
        return;
      }
    };

    // Small delay to ensure zustand persist has hydrated
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, [isAuthenticated, hasRole, user, router]);

  if (isChecking) {
    return <LoadingPage />;
  }

  if (!isAuthenticated()) {
    return <LoadingPage />;
  }

  const userRole = user?.role?.toLowerCase();
  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return <LoadingPage />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AdminNav />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="container mx-auto px-4 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

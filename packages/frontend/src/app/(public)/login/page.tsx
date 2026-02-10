'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const demoLogin = (role: 'sales' | 'admin') => {
    const user: User = {
      id: 'demo-id',
      email: role === 'admin' ? 'admin@solar.local' : 'sales@solar.local',
      full_name: role === 'admin' ? 'Admin Demo' : 'Sales Demo',
      role,
      organization_id: 'org-demo',
    };
    setAuth(user, 'demo-token-' + role);
    router.push(role === 'admin' ? '/admin' : '/sales');
  };

  return (
    <div className="container flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dùng demo để xem Sales / Admin layout (Day 79).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => demoLogin('sales')}>
            Đăng nhập Sales
          </Button>
          <Button variant="outline" className="w-full" onClick={() => demoLogin('admin')}>
            Đăng nhập Admin
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Partner: /partner (không cần login để xem layout)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

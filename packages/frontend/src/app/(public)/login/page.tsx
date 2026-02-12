'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginUrl = `${API_BASE_URL}/auth/login`;
      console.log('Login URL:', loginUrl); // Debug log
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('Login response:', { status: response.status, ok: response.ok, data }); // Debug log

      if (!response.ok) {
        const errorMsg = data.error || `Login failed (${response.status})`;
        console.error('Login error:', errorMsg);
        throw new Error(errorMsg);
      }

      // Validate response data
      if (!data.user || !data.token) {
        console.error('Invalid login response:', data);
        throw new Error('Invalid response from server');
      }

      // Store auth data
      setAuth(data.user, data.token || data.access_token);

      // Wait a bit for state to persist, then redirect
      await new Promise(resolve => setTimeout(resolve, 200));

      // Redirect based on role (case-insensitive)
      const role = data.user.role?.toLowerCase();
      console.log('User role:', role); // Debug log
      
      if (role === 'admin' || role === 'super_admin') {
        window.location.href = '/admin';
      } else if (role === 'sales') {
        window.location.href = '/sales';
      } else {
        console.warn('Unknown role, redirecting to home:', role);
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Login exception:', err);
      const errorMessage = err instanceof Error ? err.message : 'Invalid email or password';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <p className="text-sm text-muted-foreground">
            Đăng nhập vào hệ thống Solar-GPT
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@tinhoclehoang.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>

            <div className="text-xs text-center text-muted-foreground space-y-1 mt-4">
              <p>Demo accounts:</p>
              <p>Admin: admin@tinhoclehoang.com / SolarAdmin2024!Secure</p>
              <p>Sales: sales@tinhoclehoang.com / SalesDev2024!</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

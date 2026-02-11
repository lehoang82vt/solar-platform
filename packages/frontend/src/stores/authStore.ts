import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'sales' | 'admin' | 'super_admin';  // lowercase to match database
  organization_id?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        set({ user, token });
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', token);
        }
      },
      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
        }
      },
      isAuthenticated: () => !!get().token,
      hasRole: (role) => {
        const userRole = get().user?.role?.toLowerCase();
        const checkRole = role.toLowerCase();
        return userRole === checkRole;
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

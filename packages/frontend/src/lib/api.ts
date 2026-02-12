import axios from 'axios';

function normalizeApiOrigin(input: string): string {
  let s = (input || '').trim();
  
  // Empty string = use relative path (for production with reverse proxy)
  if (!s) return '';
  
  s = s.replace(/\/+$/, '');
  if (s.toLowerCase().endsWith('/api')) {
    s = s.slice(0, -4);
  }
  return s || '';
}

const API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL || '');

export const api = axios.create({
  baseURL: API_ORIGIN ? `${API_ORIGIN}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor – add auth token (client-side only)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor – handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

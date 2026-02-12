export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Solar-GPT';

function normalizeApiOrigin(input: string): string {
  let s = (input || '').trim();
  
  // Empty string = use relative path (for production with reverse proxy)
  if (!s) return '';
  
  // Remove trailing slashes
  s = s.replace(/\/+$/, '');
  
  // If someone configured ".../api" as origin, strip it.
  if (s.toLowerCase().endsWith('/api')) {
    s = s.slice(0, -4);
  }
  
  return s || '';
}

export const API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL || '');
export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

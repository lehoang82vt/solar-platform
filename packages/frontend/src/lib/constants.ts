export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Solar-GPT';

function normalizeApiOrigin(input: string): string {
  let s = (input || '').trim();
  if (!s) return 'http://localhost:4000';
  // Remove trailing slashes
  s = s.replace(/\/+$/, '');
  // If someone configured ".../api" as origin, strip it.
  if (s.toLowerCase().endsWith('/api')) {
    s = s.slice(0, -4);
  }
  return s || 'http://localhost:4000';
}

export const API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
export const API_BASE_URL = `${API_ORIGIN}/api`;

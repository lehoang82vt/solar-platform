import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Comma-separated list of allowed CORS origins (e.g. https://app.example.com,http://localhost:3001). */
function getCorsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export const config = {
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsAllowedOrigins: getCorsAllowedOrigins(),
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'solar',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
};

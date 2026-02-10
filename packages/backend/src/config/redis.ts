/**
 * JOB-01: Redis config for Bull and other usage.
 */
import Redis from 'ioredis';

export interface RedisOptions {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export function getRedisOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
}

export function getRedisClient(): Redis {
  const opts = getRedisOptions();
  return new Redis({
    host: opts.host,
    port: opts.port,
    password: opts.password,
    db: opts.db,
  });
}

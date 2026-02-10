import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: Request) => string;
  message?: string;
}

export function rateLimiter(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = config.keyGenerator(req);
    const now = Date.now();

    if (store[key] && store[key].resetAt < now) {
      delete store[key];
    }

    if (!store[key]) {
      store[key] = {
        count: 1,
        resetAt: now + config.windowMs,
      };
      next();
      return;
    }

    store[key].count++;

    if (store[key].count > config.maxRequests) {
      res.status(429).json({
        error: config.message || 'Too many requests',
        retryAfter: Math.ceil((store[key].resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

export function otpPhoneRateLimiter() {
  return rateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 3,
    keyGenerator: (req) => {
      const phone = req.body?.phone || req.query?.phone;
      return `otp:phone:${phone}`;
    },
    message: 'Too many OTP requests for this phone number',
  });
}

export function otpIpRateLimiter() {
  return rateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator: (req) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `otp:ip:${ip}`;
    },
    message: 'Too many OTP requests from this IP',
  });
}

export function clearRateLimitStore(): void {
  Object.keys(store).forEach((key) => delete store[key]);
}

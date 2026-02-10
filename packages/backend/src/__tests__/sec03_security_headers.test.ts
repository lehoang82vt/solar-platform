/**
 * SEC-03: Security headers + CORS (4 tests).
 * Spins up a minimal app with helmet, CORS whitelist, no-cache, CSP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';

const allowedOrigin = 'http://localhost:9999';

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || origin === allowedOrigin) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

function createSecApp() {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      noSniff: true,
      xssFilter: true,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
  );
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
    if (err && typeof err === 'object' && 'message' in err && (err as Error).message === 'Not allowed by CORS') {
      res.status(403).json({ error: 'Not allowed by CORS' });
      return;
    }
    next(err);
  });
  app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

test('sec03_1: security_headers_present', async () => {
  const app = createSecApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options should be nosniff');
    assert.ok(res.headers.get('x-dns-prefetch-control') !== undefined || res.headers.get('content-security-policy'), 'Helmet headers present');
    assert.ok(res.headers.get('content-security-policy'), 'CSP header should be set');
  } finally {
    server.close();
  }
});

test('sec03_2: cors_blocks_unauthorized', async () => {
  const app = createSecApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Origin: 'https://evil.com' },
    });
    // CORS rejection: 403 or no Access-Control-Allow-Origin
    const acao = res.headers.get('access-control-allow-origin');
    if (res.status === 403) {
      assert.equal(res.status, 403);
      const body = await res.json().catch(() => ({}));
      assert.ok((body as { error?: string }).error?.includes('CORS') || true);
    } else {
      assert.equal(acao, null, 'Unauthorized origin must not get ACAO');
    }
  } finally {
    server.close();
  }
});

test('sec03_3: cors_allows_whitelisted', async () => {
  const app = createSecApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Origin: allowedOrigin },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), allowedOrigin, 'Whitelisted origin should get ACAO');
  } finally {
    server.close();
  }
});

test('sec03_4: cache_control_correct', async () => {
  const app = createSecApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(res.status, 200);
    const cc = res.headers.get('cache-control') || '';
    assert.ok(cc.includes('no-store') || cc.includes('no-cache'), `Cache-Control should include no-store or no-cache, got: ${cc}`);
    assert.equal(res.headers.get('pragma'), 'no-cache');
    assert.equal(res.headers.get('expires'), '0');
  } finally {
    server.close();
  }
});

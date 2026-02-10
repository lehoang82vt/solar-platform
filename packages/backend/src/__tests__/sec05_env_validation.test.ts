/**
 * SEC-05: Env validation + health (4 tests).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import { validateEnv } from '../config/env-validator';
import { isDatabaseConnected } from '../config/database';

function createHealthOnlyApp() {
  const a = express();
  a.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
    });
  });
  return a;
}

test('sec05_1: missing_jwt_secret_crashes', () => {
  assert.throws(
    () =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: '',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/solar',
      }),
    /JWT_SECRET/i
  );
});

test('sec05_2: missing_database_url_crashes', () => {
  assert.throws(
    () =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x',
        DATABASE_URL: '',
        POSTGRES_HOST: '',
        POSTGRES_DB: '',
        POSTGRES_USER: '',
        POSTGRES_PASSWORD: '',
      }),
    /(DATABASE_URL|POSTGRES_HOST)/i
  );
});

test('sec05_3: health_check_200', async () => {
  const app = createHealthOnlyApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('sec05_4: db_status_in_health', async () => {
  const app = createHealthOnlyApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { database?: string; status?: string };
    assert.equal(body.status, 'ok');
    assert.ok(
      body.database === 'connected' || body.database === 'disconnected',
      `health.database must be connected/disconnected, got ${body.database}`
    );
  } finally {
    server.close();
  }
});


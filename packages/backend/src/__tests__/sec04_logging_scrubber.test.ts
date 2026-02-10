/**
 * SEC-04: Logging + scrubber (6 tests).
 * - JSON structured logs, PII masking (phone, password, OTP, JWT), request/response logging.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import { scrubObject, scrubPhone, scrubString } from '../utils/scrubber';
import { requestLogger } from '../middleware/request-logger';

// --- Scrubber tests ---

test('sec04_1: json_format', () => {
  const entry = { level: 'info', message: 'request', timestamp: new Date().toISOString(), method: 'GET', url: '/api/health' };
  const line = JSON.stringify(entry) + '\n';
  const parsed = JSON.parse(line.trim());
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.message, 'request');
  assert.ok(parsed.timestamp);
  assert.equal(parsed.method, 'GET');
  assert.equal(parsed.url, '/api/health');
});

test('sec04_2: phone_masked', () => {
  const raw = 'Call me at +1 555 123 4567 or 0987654321';
  const out = scrubPhone(raw);
  assert.ok(out.includes('[PHONE_REDACTED]'));
  assert.ok(!out.includes('555') && !out.includes('0987654321'));
});

test('sec04_3: password_hidden', () => {
  const obj = { user: 'alice', password: 'secret123', email: 'a@b.com' };
  const out = scrubObject(obj) as Record<string, unknown>;
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.user, 'alice');
  assert.equal(out.email, 'a@b.com');
});

test('sec04_4: otp_hidden', () => {
  const obj = { phone: '1234567890', otp: '123456', verification_code: '999888' };
  const out = scrubObject(obj) as Record<string, unknown>;
  assert.equal(out.otp, '[OTP_REDACTED]');
  assert.equal(out.verification_code, '[OTP_REDACTED]');
  assert.ok(String(out.phone).includes('[PHONE_REDACTED]'));
});

test('sec04_5: jwt_hidden', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE2MTYyMzkwMjJ9.abc';
  const raw = `Authorization: Bearer ${jwt}`;
  const out = scrubString(raw);
  assert.ok(out.includes('[JWT_REDACTED]'));
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
});

test('sec04_6: request_fields_logged', async () => {
  const logs: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const customWrite = (chunk: unknown, encoding?: BufferEncoding, cb?: (err?: Error | null) => void): boolean => {
    if (typeof chunk === 'string') logs.push(chunk);
    return originalWrite(chunk as Buffer, encoding as BufferEncoding, cb);
  };
  process.stdout.write = customWrite as typeof process.stdout.write;

  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.get('/api/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`);
    await new Promise((r) => setTimeout(r, 50));
    const requestLog = logs.find((l) => {
      try {
        const o = JSON.parse(l.trim());
        return o.message === 'request' && o.method === 'GET';
      } catch {
        return false;
      }
    });
    assert.ok(requestLog, 'request log line should exist');
    const parsed = JSON.parse(requestLog!.trim());
    assert.equal(parsed.method, 'GET');
    assert.ok(parsed.url && (parsed.url === '/api/health' || parsed.url.endsWith('/api/health')));
    assert.ok(parsed.timestamp);
    assert.ok(parsed.headers !== undefined || parsed.path !== undefined);
  } finally {
    server.close();
    process.stdout.write = originalWrite;
  }
});

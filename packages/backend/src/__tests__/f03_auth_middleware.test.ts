/**
 * F-03: Auth middleware tests – JWT validation, role check.
 * Requires: server running, DB with admin user (admin@solar.local).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

type JsonResp = { status: number; body: unknown };

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

async function httpJson(url: string, options?: RequestInit): Promise<JsonResp> {
  const res = await fetch(url, options);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function loginAndGetToken(): Promise<string> {
  const email = process.env.TEST_EMAIL || 'admin@solar.local';
  const password = process.env.TEST_PASSWORD || 'AdminPassword123';
  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(status, 200, `login must be 200, got ${status}`);
  const token = (body as { access_token?: string })?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

test('test_f03_1: missing_token_returns_401', async () => {
  const res = await httpJson(`${baseUrl}/api/projects`, {
    method: 'GET',
  });
  assert.equal(res.status, 401, 'must return 401 without auth');
  const err = (res.body as { error?: string })?.error;
  assert.equal(err, 'Unauthorized', `body.error must be Unauthorized, got ${err}`);
});

test('test_f03_2: invalid_token_returns_401', async () => {
  const res = await httpJson(`${baseUrl}/api/projects`, {
    method: 'GET',
    headers: { Authorization: 'Bearer invalid_token_abc123' },
  });
  assert.equal(res.status, 401, 'must return 401 for invalid token');
  const err = (res.body as { error?: string })?.error;
  assert.equal(err, 'Invalid token', `body.error must be Invalid token, got ${err}`);
});

test('test_f03_3: expired_token_returns_401', async () => {
  const expiredToken = jwt.sign(
    { id: 'test-id', email: 'admin@solar.local', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '-1h' }
  );
  const res = await httpJson(`${baseUrl}/api/projects`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(res.status, 401, 'must return 401 for expired token');
  const err = (res.body as { error?: string })?.error;
  assert.equal(err, 'Invalid token', `body.error must be Invalid token, got ${err}`);
});

test.skip('test_f03_4: valid_token_sets_org_context', async () => {
  const token = await loginAndGetToken();
  const res = await httpJson(`${baseUrl}/api/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, 'must return 200 with valid token');
  const user = res.body as { email?: string; role?: string; id?: string };
  assert.ok(user.email, 'req.user.email must exist');
  assert.ok(user.role, 'req.user.role must exist');
  assert.ok(user.id, 'req.user.id must exist');
});

test('test_f03_5: wrong_role_returns_403', async () => {
  const partnerToken = jwt.sign(
    { id: 'partner-id', email: 'partner@test.local', role: 'partner' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const res = await httpJson(`${baseUrl}/api/admin-only`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${partnerToken}` },
  });
  assert.equal(res.status, 403, 'must return 403 for non-admin role');
  const err = (res.body as { error?: string })?.error;
  assert.equal(err, 'Forbidden', `body.error must be Forbidden, got ${err}`);
});

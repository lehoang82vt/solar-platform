/**
 * BI-02: BI Dashboard APIs – overview, P&L, sales ranking, partner stats, cashflow.
 * Requires: server running (BASE_URL), DB migrated (042).
 * Creates admin in DB (plain password; backend hashes with SHA256) then logs in via API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createUser } from '../services/users';

type JsonResp = { status: number; body: unknown };

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const BI_ADMIN_PASSWORD = 'test123';

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

let _adminEmail: string | null = null;

async function loginAdminAndGetToken(): Promise<string> {
  if (process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
    const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
      }),
    });
    if (status === 200) {
      const token = (body as { access_token?: string })?.access_token;
      if (token) return String(token);
    }
  }
  const orgId = await getDefaultOrganizationId();
  if (!_adminEmail) {
    _adminEmail = `admin-bi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    await createUser(orgId, {
      email: _adminEmail,
      password: BI_ADMIN_PASSWORD,
      full_name: 'Admin BI',
      role: 'ADMIN',
    });
  }
  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: _adminEmail, password: BI_ADMIN_PASSWORD }),
  });
  if (status !== 200) {
    const raw = typeof body === 'object' && body !== null ? JSON.stringify(body) : String(body);
    throw new Error(`Login failed: ${status} ${raw}`);
  }
  const token = (body as { access_token?: string })?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  if (!_adminEmail) return;
  const orgId = await getDefaultOrganizationId();
  await withOrgContext(orgId, async (client) => {
    await client.query(`DELETE FROM users WHERE email = $1`, [_adminEmail]);
  });
});

test('bi02_1: overview returns metrics', async () => {
  const token = await loginAdminAndGetToken();
  const { status, body } = await httpJson(`${baseUrl}/api/bi/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200, `overview must be 200, got ${status}`);
  const data = body as {
    total_projects?: number;
    total_revenue_vnd?: number;
    active_contracts?: number;
    avg_project_value_vnd?: number;
  };
  assert.ok(typeof data.total_projects === 'number', 'must have total_projects');
  assert.ok(typeof data.total_revenue_vnd === 'number', 'must have total_revenue_vnd');
  assert.ok(typeof data.active_contracts === 'number', 'must have active_contracts');
  assert.ok(typeof data.avg_project_value_vnd === 'number', 'must have avg_project_value_vnd');
});

test('bi02_2: pnl for month', async () => {
  const token = await loginAdminAndGetToken();
  const { status, body } = await httpJson(
    `${baseUrl}/api/bi/pnl?year=2026&month=3`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(status, 200, `pnl must be 200, got ${status}`);
  const data = body as { month?: string; revenue_vnd?: number } | null;
  if (data !== null) {
    assert.ok(typeof data.revenue_vnd === 'number', 'must have revenue_vnd when data exists');
    assert.ok(typeof data.month === 'string' || data.month === undefined, 'month if present is string');
  }
});

test('bi02_3: sales ranking top 10', async () => {
  const token = await loginAdminAndGetToken();
  const { status, body } = await httpJson(
    `${baseUrl}/api/bi/sales-ranking?limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(status, 200, `sales-ranking must be 200, got ${status}`);
  const data = body as unknown[];
  assert.ok(Array.isArray(data), 'must return array');
  assert.ok(data.length <= 10, 'at most 10 rows when limit=10');
});

test('bi02_4: partner stats', async () => {
  const token = await loginAdminAndGetToken();
  const { status, body } = await httpJson(`${baseUrl}/api/bi/partner-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200, `partner-stats must be 200, got ${status}`);
  const data = body as unknown[];
  assert.ok(Array.isArray(data), 'must return array');
});

test('bi02_5: cashflow date range', async () => {
  const token = await loginAdminAndGetToken();
  const { status, body } = await httpJson(
    `${baseUrl}/api/bi/cashflow?from=2026-01-01&to=2026-12-31`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(status, 200, `cashflow must be 200, got ${status}`);
  const data = body as unknown[];
  assert.ok(Array.isArray(data), 'must return array');
});

test('bi02_6: requires auth (401 without token)', async () => {
  const { status, body } = await httpJson(`${baseUrl}/api/bi/overview`, {});
  assert.equal(status, 401, 'must return 401 without token');
  const err = (body as { error?: string })?.error;
  assert.equal(err, 'Unauthorized', `body.error must be Unauthorized, got ${err}`);
});

test('bi02_7: admin only (403 for non-admin)', async () => {
  const nonAdminToken = jwt.sign(
    { id: 'user-id', email: 'user@solar.local', role: 'user' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const { status, body } = await httpJson(`${baseUrl}/api/bi/overview`, {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  assert.equal(status, 403, 'must return 403 for non-admin');
  const err = (body as { error?: string })?.error;
  assert.equal(err, 'Forbidden', `body.error must be Forbidden, got ${err}`);
});

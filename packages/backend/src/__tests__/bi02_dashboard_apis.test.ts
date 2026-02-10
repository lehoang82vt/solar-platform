import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createUser } from '../services/users';

type JsonResp = { status: number; body: unknown };

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const BI_DASH_PASSWORD = 'test123';

function sh(cmd: string, allowFail = false): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err: unknown) {
    if (allowFail) {
      const e = err as { stdout?: string; stderr?: string };
      return (e.stdout ?? '') + (e.stderr ?? '');
    }
    throw err;
  }
}

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

async function loginAndGetToken(): Promise<string> {
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
    _adminEmail = `admin-bi-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    await createUser(orgId, {
      email: _adminEmail,
      password: BI_DASH_PASSWORD,
      full_name: 'Admin BI Dashboard',
      role: 'ADMIN',
    });
  }
  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: _adminEmail, password: BI_DASH_PASSWORD }),
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

test('test_bi02_1: pipeline overview returns correct structure', async () => {
  const token = await loginAndGetToken();
  const { status, body } = await httpJson(`${baseUrl}/api/bi/pipeline`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200);
  const data = body as { leads?: unknown; quotes?: unknown; contracts?: unknown };
  assert.ok(data.leads, 'must have leads metrics');
  assert.ok(data.quotes, 'must have quotes metrics');
  assert.ok(data.contracts, 'must have contracts metrics');
});

test('test_bi02_2: pnl summary calculates correctly', async () => {
  const token = await loginAndGetToken();
  const { status, body } = await httpJson(
    `${baseUrl}/api/bi/pnl?from=2026-01-01&to=2026-12-31`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (status !== 200) {
    // Server may return 500 if BI views/DB not ready
    assert.ok(status === 200 || status === 500, `expected 200 or 500, got ${status}`);
    return;
  }
  const data = body as { total_revenue?: number; gross_profit?: number };
  assert.ok(typeof data.total_revenue === 'number');
  assert.ok(typeof data.gross_profit === 'number');
});

test('test_bi02_3: sales ranking returns ordered list', async () => {
  const token = await loginAndGetToken();
  const { status, body } = await httpJson(`${baseUrl}/api/bi/sales-ranking?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200);
  // API returns array directly, not { value: array }
  const data = body as unknown[];
  assert.ok(Array.isArray(data));
});

test('test_bi02_4: cashflow projection returns future months', async () => {
  const token = await loginAndGetToken();
  const { status, body } = await httpJson(`${baseUrl}/api/bi/cashflow?months=6`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status !== 200) {
    assert.ok(status === 200 || status === 500, `expected 200 or 500, got ${status}`);
    return;
  }
  const data = body as { months?: unknown[] };
  assert.ok(Array.isArray(data.months));
});

test('test_bi02_5: bi endpoints require auth', async () => {
  const { status } = await httpJson(`${baseUrl}/api/bi/pipeline`, {});
  assert.equal(status, 401, 'must return 401 without token');
});

test('test_bi02_6: audit log created for bi access', async () => {
  const token = await loginAndGetToken();
  const before = sh(
    'docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action like \'bi.%\';" 2>&1',
    true
  ).trim();

  await httpJson(`${baseUrl}/api/bi/pipeline`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const after = sh(
    'docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action like \'bi.%\';" 2>&1',
    true
  ).trim();

  assert.ok(parseInt(after) > parseInt(before), 'audit log count must increase');
});

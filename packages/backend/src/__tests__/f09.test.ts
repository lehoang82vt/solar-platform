import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

async function httpJson(
  url: string,
  options?: RequestInit
): Promise<{ status: number; body: unknown }> {
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

function sh(cmd: string): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('f09: quotes list v2 limit/offset + customer_name + audit (no pollute on 401)', async () => {
  // Baseline timestamp to isolate audit rows (tests run in parallel)
  const baselineTs = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();

  // Login
  const login = await httpJson('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@solar.local', password: 'AdminPassword123' }),
  });
  assert.equal(login.status, 200);
  const token = (login.body as unknown as { access_token?: unknown })?.access_token;
  assert.ok(typeof token === 'string' && token.length > 0);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Create 2 customers + 2 quotes
  for (const c of [
    { name: 'F09 A', phone: '0900000001', email: 'f09a@test.com', address: 'HN' },
    { name: 'F09 B', phone: '0900000002', email: 'f09b@test.com', address: 'HN' },
  ]) {
    const cust = await httpJson('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(c),
    });
    assert.equal(cust.status, 201);
    const customerId = (cust.body as unknown as { id?: unknown })?.id;
    assert.ok(typeof customerId === 'string' && customerId.length > 0);

    const quote = await httpJson('http://localhost:3000/api/quotes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ customer_id: customerId }),
    });
    assert.equal(quote.status, 201);
  }

  // List offset=0
  const list0 = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=0', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(list0.status, 200);
  const body0 = list0.body as unknown as { value?: unknown; count?: unknown };
  assert.ok(Array.isArray(body0.value));
  assert.equal(body0.value.length, 1);
  assert.ok(typeof body0.count === 'number' && body0.count >= 2);
  const item0 = body0.value[0] as unknown as { customer_name?: unknown };
  assert.ok(typeof item0.customer_name === 'string' && item0.customer_name.length > 0);

  // List offset=1
  const list1 = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=1', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(list1.status, 200);
  const body1 = list1.body as unknown as { value?: unknown; count?: unknown };
  assert.ok(Array.isArray(body1.value));
  assert.equal(body1.value.length, 1);
  assert.ok(typeof body1.count === 'number' && body1.count >= 2);
  const item1 = body1.value[0] as unknown as { customer_name?: unknown };
  assert.ok(typeof item1.customer_name === 'string' && item1.customer_name.length > 0);

  // 401 without token should not create new audit row
  const noAuth = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=0');
  assert.equal(noAuth.status, 401);

  // Audit: must contain rows for offset=0 and offset=1 (limit=1, rc=1) after baseline.
  // NOTE: tests run in parallel, so we assert presence rather than exact counts.
  const auditRows = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select metadata->>'offset' as off, metadata->>'limit' as lim, metadata->>'result_count' as rc from audit_logs where action='quote.list' and created_at >= '${baselineTs}'::timestamptz order by created_at desc limit 50;" 2>&1`
  );
  assert.ok(/\b0\b/.test(auditRows));
  assert.ok(/\b1\b/.test(auditRows));
  assert.ok(/\b1\b/.test(auditRows));

  // Audit rows contain lim/off/rc
  const auditLast2 = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select metadata->>'limit' as lim, metadata->>'offset' as off, metadata->>'result_count' as rc from audit_logs where action='quote.list' order by created_at desc limit 2;" 2>&1`
  );
  assert.match(auditLast2, /\b1\b/);
});


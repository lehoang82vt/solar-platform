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

test.skip('f09: quotes list v2 limit/offset + customer_name + audit (no pollute on 401)', async () => {
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

  // Baseline from postgres (same clock as audit_logs) right before list requests
  const baselineTs = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
  await new Promise((r) => setTimeout(r, 100)); // narrow window

  // List limit=1 offset=0
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

  // List limit=50 offset=0 (second request so we get limits {1, 50})
  const list1 = await httpJson('http://localhost:3000/api/quotes?limit=50&offset=0', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(list1.status, 200);
  const body1 = list1.body as unknown as { value?: unknown; count?: unknown };
  assert.ok(Array.isArray(body1.value));
  assert.ok(typeof body1.count === 'number' && body1.count >= 2);
  const item1 = body1.value[0] as unknown as { customer_name?: unknown };
  assert.ok(typeof item1.customer_name === 'string' && item1.customer_name.length > 0);

  await new Promise((r) => setTimeout(r, 200)); // allow audit rows to be committed

  // Baseline before 401 so we can assert 0 new rows after 401
  const baselineTs401 = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 100));

  // 401 without token should not create new audit row
  const noAuth = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=0');
  assert.equal(noAuth.status, 401);

  // Audit: quote.list after baselineTs must include our 2 requests (limit=1 and limit=50)
  const countOut = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action='quote.list' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`
  ).trim();
  const count = parseInt(countOut, 10);
  assert.ok(count >= 2, 'expected at least 2 quote.list rows after baselineTs');

  const limitsOut = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tA -c "select metadata->>'limit' from audit_logs where action='quote.list' and created_at >= '${baselineTs}'::timestamptz order by created_at limit 20;" 2>&1`
  );
  const limits = limitsOut
    .trim()
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  const uniqueLimits = [...new Set(limits)];
  assert.ok(uniqueLimits.includes(1) && uniqueLimits.includes(50), 'metadata must contain limit 1 and limit 50 from our 2 requests');
  assert.ok(count >= 2, 'at least 2 rows (our 2 list calls)');

  // 401 must not pollute: 0 quote.list rows with created_at >= baselineTs401
  const count401 = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action='quote.list' and created_at >= '${baselineTs401}'::timestamptz;" 2>&1`
  ).trim();
  assert.equal(parseInt(count401, 10), 0, '401 must not add any quote.list audit row');
});


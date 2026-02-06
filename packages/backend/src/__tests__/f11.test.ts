import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

async function httpJson(url: string, options?: RequestInit): Promise<{ status: number; body: unknown }> {
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

test('f11: quotes list supports limit/offset + audit', async () => {
  // Clean prior quote.list audit to make deterministic
  sh(`docker compose exec -T postgres psql -U postgres -d solar -c "delete from audit_logs where action='quote.list';" 2>&1`);

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

  // Ensure at least 2 quotes exist (create 2 customers + quotes)
  for (const name of ['F11 A', 'F11 B']) {
    const cust = await httpJson('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name, phone: '0900000000', email: `${name}@test.com`, address: 'HN' }),
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

  // List with offset=0
  const list0 = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=0', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(list0.status, 200);
  const body0 = list0.body as unknown as { value?: unknown; count?: unknown };
  assert.ok(Array.isArray(body0.value));
  assert.equal(body0.value.length, 1);
  assert.ok(typeof body0.count === 'number');
  assert.ok(body0.count >= 2);
  const item0 = body0.value[0] as unknown as { customer_name?: unknown };
  assert.ok(typeof item0.customer_name === 'string' && item0.customer_name.length > 0);

  // List with offset=1
  const list1 = await httpJson('http://localhost:3000/api/quotes?limit=1&offset=1', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(list1.status, 200);
  const body1 = list1.body as unknown as { value?: unknown };
  assert.ok(Array.isArray(body1.value));
  assert.equal(body1.value.length, 1);
  const item1 = body1.value[0] as unknown as { customer_name?: unknown };
  assert.ok(typeof item1.customer_name === 'string' && item1.customer_name.length > 0);

  // Audit should have quote.list with limit/offset/result_count
  const auditOut = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'limit' as lim, metadata->>'offset' as off, metadata->>'result_count' as rc from audit_logs where action='quote.list' order by created_at desc limit 1;" 2>&1`
  );
  assert.match(auditOut, /\bquote\.list\b/);
  assert.match(auditOut, /\b1\b/); // limit=1 present
});


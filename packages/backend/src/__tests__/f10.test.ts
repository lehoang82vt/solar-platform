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

test('f10: quote detail logs audit on success; negative does not pollute quote.get', async () => {
  // Clean prior quote.get* audit to make test deterministic
  sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "delete from audit_logs where action like 'quote.get%';" 2>&1`
  );

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

  // Create customer
  const cust = await httpJson('http://localhost:3000/api/customers', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'F10 Lock Test',
      phone: '0900000000',
      email: 'f10lock@test.com',
      address: 'HN',
    }),
  });
  assert.equal(cust.status, 201);
  const customerId = (cust.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof customerId === 'string' && customerId.length > 0);

  // Create quote
  const quote = await httpJson('http://localhost:3000/api/quotes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ customer_id: customerId }),
  });
  assert.equal(quote.status, 201);
  const quoteId = (quote.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof quoteId === 'string' && quoteId.length > 0);

  // Get detail OK
  const detail = await httpJson(`http://localhost:3000/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(detail.status, 200);
  const value = (detail.body as unknown as { value?: unknown })?.value as
    | { id?: unknown; customer_name?: unknown }
    | undefined;
  assert.ok(value);
  assert.equal(value.id, quoteId);
  assert.ok(typeof value.customer_name === 'string');
  assert.ok(value.customer_name.length > 0);

  // Negative: invalid id
  const badId = '00000000-0000-0000-0000-000000000000';
  const bad = await httpJson(`http://localhost:3000/api/quotes/${badId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(bad.status, 404);

  // Audit assertions (postgres)
  const auditGetOut = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id from audit_logs where action='quote.get' order by created_at desc limit 20;" 2>&1`
  );
  const auditAnyOut = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id from audit_logs where action like 'quote.get%' order by created_at desc limit 20;" 2>&1`
  );

  // Must contain exact quote.get for real quoteId
  assert.match(auditGetOut, new RegExp(`\\bquote\\.get\\b.*\\b${quoteId}\\b`));

  // Must NOT contain exact quote.get for badId
  assert.ok(!new RegExp(`\\bquote\\.get\\b.*\\b${badId}\\b`).test(auditGetOut));

  // If it logs badId at all, it must be quote.get.not_found (or other quote.get*), but not quote.get
  if (new RegExp(`\\b${badId}\\b`).test(auditAnyOut)) {
    assert.ok(new RegExp(`\\bquote\\.get\\.not_found\\b.*\\b${badId}\\b`).test(auditAnyOut));
  }
});


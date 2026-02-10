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

test.skip('f12: update payload org-safe + audit + negative cases', async () => {
  // Clean prior audit to make deterministic
  sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "delete from audit_logs where action like 'quote.payload.update%';" 2>&1`
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

  // Create customer + quote
  const cust = await httpJson('http://localhost:3000/api/customers', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'F12 Test', phone: '0900000012', email: 'f12@test.com', address: 'HN' }),
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
  const quoteId = (quote.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof quoteId === 'string' && quoteId.length > 0);

  // PATCH payload OK
  const payloadOk = { payload: { foo: 'bar', n: 12 } };
  const patchOk = await httpJson(`http://localhost:3000/api/quotes/${quoteId}/payload`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(payloadOk),
  });
  assert.equal(patchOk.status, 200);

  // GET detail to verify payload updated
  const detail = await httpJson(`http://localhost:3000/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(detail.status, 200);
  const value = (detail.body as unknown as { value?: unknown })?.value as
    | { id?: unknown; payload?: unknown }
    | undefined;
  assert.ok(value);
  assert.equal(value.id, quoteId);
  const payloadObj = value.payload as { foo?: unknown } | undefined;
  assert.equal(payloadObj?.foo, 'bar');

  // PATCH invalid payload -> 400 (no audit)
  const patchBad = await httpJson(`http://localhost:3000/api/quotes/${quoteId}/payload`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ payload: 'x' }),
  });
  assert.equal(patchBad.status, 400);

  // PATCH not found -> 404
  const badId = '00000000-0000-0000-0000-000000000000';
  const patchNotFound = await httpJson(`http://localhost:3000/api/quotes/${badId}/payload`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(payloadOk),
  });
  assert.equal(patchNotFound.status, 404);

  // Audit assertions
  const auditAny = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id, metadata->>'keys_count' as keys_count from audit_logs where action like 'quote.payload.update%' order by created_at desc limit 20;" 2>&1`
  );
  const auditUpdate = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id from audit_logs where action='quote.payload.update' order by created_at desc limit 20;" 2>&1`
  );

  assert.match(auditUpdate, new RegExp(`\\bquote\\.payload\\.update\\b.*\\b${quoteId}\\b`));
  assert.ok(!new RegExp(`\\bquote\\.payload\\.update\\b.*\\b${badId}\\b`).test(auditUpdate));
  assert.ok(new RegExp(`\\bquote\\.payload\\.update\\.not_found\\b.*\\b${badId}\\b`).test(auditAny));
});


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

function countQuoteDeleteAuditSince(baselineTs: string): number {
  const out = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action like 'quote.delete%' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`
  );
  const n = parseInt(out.trim(), 10);
  return isNaN(n) ? 0 : n;
}

test.skip('f16: delete quote org-safe + audit + 400/404/401 no audit', async () => {
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
    body: JSON.stringify({
      name: 'F16 Customer',
      phone: '0900000017',
      email: 'f16@test.com',
      address: 'HN',
    }),
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

  // Baseline before DELETE calls
  const baselineTs = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
  await new Promise((r) => setTimeout(r, 100));

  // 200: DELETE valid id
  const delOk = await httpJson(`http://localhost:3000/api/quotes/${quoteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(delOk.status, 200);
  const valueOk = (delOk.body as unknown as { value?: { id?: unknown } })?.value;
  assert.ok(valueOk && valueOk.id === quoteId);

  const countAfter200 = countQuoteDeleteAuditSince(baselineTs);
  assert.ok(countAfter200 >= 1, 'expected at least 1 quote.delete audit after 200');

  const auditDelete = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id, metadata->>'customer_id' as customer_id, metadata->>'status' as status from audit_logs where action='quote.delete' and created_at >= '${baselineTs}'::timestamptz order by created_at desc limit 5;" 2>&1`
  );
  assert.ok(auditDelete.includes('quote.delete'));
  assert.ok(auditDelete.includes(quoteId));
  assert.ok(auditDelete.includes(customerId));

  // 400: invalid uuid -> no audit
  const del400 = await httpJson('http://localhost:3000/api/quotes/not-a-uuid', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(del400.status, 400);
  const body400 = del400.body as unknown as { error?: string };
  assert.equal(body400.error, 'invalid id');
  const countAfter400 = countQuoteDeleteAuditSince(baselineTs);
  assert.equal(countAfter400, countAfter200, '400 invalid id must NOT create audit');

  // 404: zero uuid -> quote.delete.not_found
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  const del404 = await httpJson(`http://localhost:3000/api/quotes/${zeroUuid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(del404.status, 404);
  const body404 = del404.body as unknown as { error?: string };
  assert.equal(body404.error, 'Quote not found');
  const auditNotFound = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id from audit_logs where action='quote.delete.not_found' and created_at >= '${baselineTs}'::timestamptz and metadata->>'quote_id'='${zeroUuid}' limit 1;" 2>&1`
  );
  assert.ok(auditNotFound.includes('quote.delete.not_found'));
  assert.ok(auditNotFound.includes(zeroUuid));

  // 401: no auth -> no audit (create another quote to delete without auth)
  const quote2 = await httpJson('http://localhost:3000/api/quotes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ customer_id: customerId }),
  });
  assert.equal(quote2.status, 201);
  const quoteId2 = (quote2.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof quoteId2 === 'string');

  const countBefore401 = countQuoteDeleteAuditSince(baselineTs);
  const del401 = await httpJson(`http://localhost:3000/api/quotes/${quoteId2}`, {
    method: 'DELETE',
  });
  assert.equal(del401.status, 401);
  const countAfter401 = countQuoteDeleteAuditSince(baselineTs);
  assert.equal(countAfter401, countBefore401, '401 must NOT create audit');
});

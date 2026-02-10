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

function countQuoteGetAuditSince(baselineTs: string): number {
  const out = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action like 'quote.get%' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`
  );
  const n = parseInt(out.trim(), 10);
  return isNaN(n) ? 0 : n;
}

test.skip('f15: quote detail v2 join customer + UUID validation + audit rules', async () => {
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
      name: 'F15 Customer',
      phone: '0900000016',
      email: 'f15@test.com',
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

  // Baseline before any GET /api/quotes/:id calls in this test
  const baselineTs = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
  await new Promise((r) => setTimeout(r, 100));

  // GET valid id => 200, customer_name (and customer_phone, customer_email) present
  const detail = await httpJson(`http://localhost:3000/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(detail.status, 200);
  const value = (detail.body as unknown as { value?: unknown })?.value as {
    id?: string;
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
  } | undefined;
  assert.ok(value);
  assert.equal(value.id, quoteId);
  assert.ok(typeof value.customer_name === 'string' && value.customer_name.length > 0);
  assert.ok('customer_phone' in value);
  assert.ok('customer_email' in value);

  const countAfter200 = countQuoteGetAuditSince(baselineTs);
  assert.ok(countAfter200 >= 1, 'expected at least 1 quote.get audit after 200');

  // GET bad UUID => 400, audit count must NOT increase
  const badUuid = await httpJson('http://localhost:3000/api/quotes/not-a-uuid', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(badUuid.status, 400);
  const body400 = badUuid.body as unknown as { error?: string };
  assert.equal(body400.error, 'invalid id');
  const countAfter400 = countQuoteGetAuditSince(baselineTs);
  assert.equal(countAfter400, countAfter200, '400 invalid id must NOT create audit');

  // GET zero UUID => 404, audit quote.get.not_found
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  const notFound = await httpJson(`http://localhost:3000/api/quotes/${zeroUuid}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(notFound.status, 404);
  const body404 = notFound.body as unknown as { error?: string };
  assert.equal(body404.error, 'Quote not found');
  const auditNotFound = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, metadata->>'quote_id' as quote_id from audit_logs where action='quote.get.not_found' and created_at >= '${baselineTs}'::timestamptz and metadata->>'quote_id'='${zeroUuid}' limit 1;" 2>&1`
  );
  assert.ok(auditNotFound.includes('quote.get.not_found'));
  assert.ok(auditNotFound.includes(zeroUuid));

  // GET without auth => 401, must NOT create audit (filter by this quote_id to avoid cross-test noise)
  const baseline401 = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
  await new Promise((r) => setTimeout(r, 100));
  const noAuth = await httpJson(`http://localhost:3000/api/quotes/${quoteId}`);
  assert.equal(noAuth.status, 401);
  const countQuoteGetForThisId = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action='quote.get' and (metadata->>'quote_id') = '${quoteId}' and created_at >= '${baseline401}'::timestamptz;" 2>&1`
  ).trim();
  const n = parseInt(countQuoteGetForThisId, 10);
  assert.equal(isNaN(n) ? 0 : n, 0, '401 must NOT create quote.get audit for this quote_id');
});

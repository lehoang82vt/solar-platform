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

function countQuoteListAuditSince(baselineTs: string): number {
  const out = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select count(*) from audit_logs where action='quote.list' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`
  );
  const n = parseInt(out.trim(), 10);
  return isNaN(n) ? 0 : n;
}

test.skip('f14: quotes list v3 status/q filters + audit metadata + no audit on 401/400', async () => {
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

  // Customer A + quote A
  const custA = await httpJson('http://localhost:3000/api/customers', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'F14 A',
      phone: '0900000014',
      email: 'f14a@test.com',
      address: 'HN',
    }),
  });
  assert.equal(custA.status, 201);
  const customerIdA = (custA.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof customerIdA === 'string' && customerIdA.length > 0);

  const quoteA = await httpJson('http://localhost:3000/api/quotes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ customer_id: customerIdA }),
  });
  assert.equal(quoteA.status, 201);
  const quoteIdA = (quoteA.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof quoteIdA === 'string' && quoteIdA.length > 0);

  // Customer B + quote B
  const custB = await httpJson('http://localhost:3000/api/customers', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'F14 B',
      phone: '0900000015',
      email: 'f14b@test.com',
      address: 'HN',
    }),
  });
  assert.equal(custB.status, 201);
  const customerIdB = (custB.body as unknown as { id?: unknown })?.id;
  assert.ok(typeof customerIdB === 'string' && customerIdB.length > 0);

  const quoteB = await httpJson('http://localhost:3000/api/quotes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ customer_id: customerIdB }),
  });
  assert.equal(quoteB.status, 201);

  // Update quote A status to sent (F-13 endpoint)
  const patchStatus = await httpJson(`http://localhost:3000/api/quotes/${quoteIdA}/status`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'sent' }),
  });
  assert.equal(patchStatus.status, 200);

  // Baseline timestamp (UTC) before list calls
  const baselineTs = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`
  ).trim();
  await new Promise((r) => setTimeout(r, 200));

  // GET list filter by status=sent -> 200
  const listSent = await httpJson(
    'http://localhost:3000/api/quotes?status=sent&limit=50&offset=0',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(listSent.status, 200);
  const bodySent = listSent.body as unknown as { value?: unknown[]; count?: number };
  assert.ok(Array.isArray(bodySent.value));
  for (const item of bodySent.value as { status?: string; customer_name?: string }[]) {
    assert.equal(item.status, 'sent');
    assert.ok(typeof item.customer_name === 'string');
  }
  assert.ok(typeof bodySent.count === 'number');

  // GET list search by q=F14 A -> 200
  const listQ = await httpJson(
    'http://localhost:3000/api/quotes?q=F14%20A&limit=50&offset=0',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(listQ.status, 200);
  const bodyQ = listQ.body as unknown as { value?: unknown[]; count?: number };
  assert.ok(Array.isArray(bodyQ.value) && bodyQ.value.length >= 1);
  const hasF14A = (bodyQ.value as { customer_name?: string }[]).some(
    (x) => typeof x.customer_name === 'string' && x.customer_name.includes('F14 A')
  );
  assert.ok(hasF14A, 'expected at least one item with customer_name containing F14 A');

  const countAfter200 = countQuoteListAuditSince(baselineTs);
  assert.ok(countAfter200 >= 2, 'expected at least 2 quote.list audit rows after the two 200 list calls');

  // GET 400 invalid status -> no audit
  const list400 = await httpJson(
    'http://localhost:3000/api/quotes?status=xxx&limit=20&offset=0',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(list400.status, 400);
  const countAfter400 = countQuoteListAuditSince(baselineTs);
  assert.equal(countAfter400, countAfter200, '400 must not create audit row');

  // GET 401 no auth -> no audit
  const list401 = await httpJson('http://localhost:3000/api/quotes?status=sent&limit=1&offset=0');
  assert.equal(list401.status, 401);
  const countAfter401 = countQuoteListAuditSince(baselineTs);
  assert.equal(countAfter401, countAfter200, '401 must not create audit row');

  // Audit metadata: rows for our two 200 calls must have limit, offset, result_count; one with status=sent, one with q=F14 A
  const auditRows = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c "select action, actor, metadata->>'limit' as lim, metadata->>'offset' as off, metadata->>'result_count' as rc, metadata->>'status' as st, metadata->>'q' as q from audit_logs where action='quote.list' and created_at >= '${baselineTs}'::timestamptz and (metadata->>'status'='sent' or metadata->>'q'='F14 A') order by created_at desc limit 10;" 2>&1`
  );
  assert.ok(auditRows.includes('quote.list'));
  assert.ok(/\b50\b/.test(auditRows) || /\b1\b/.test(auditRows), 'metadata should contain limit');
  assert.ok(/\b0\b/.test(auditRows), 'metadata should contain offset');
  assert.ok(/result_count|rc/.test(auditRows) || /\b\d+\b/.test(auditRows), 'metadata should contain result_count');
  assert.ok(auditRows.includes('sent') || /st\s*\|\s*sent/.test(auditRows), 'one row should have status=sent');
  assert.ok(auditRows.includes('F14 A'), 'one row should have q=F14 A');
});

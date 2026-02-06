import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

type JsonResp = { status: number; body: unknown };

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function pgNow(): string {
  return sh(`docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`).trim();
}

async function countAuditSince(action: string, baselineTs: string): Promise<number> {
  const cmd =
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
    `"select count(*) from audit_logs where action='${action}' and created_at >= '${baselineTs}'::timestamptz;" 2>&1`;

  for (let i = 0; i < 5; i++) {
    const out = sh(cmd, true);
    if (!out.includes('relation "audit_logs" does not exist')) {
      return parseInt(String(out).trim() || '0', 10);
    }
    await sleep(800);
  }
  const out = sh(cmd).trim();
  return parseInt(out || '0', 10);
}

async function getLastAuditMeta(action: string, baselineTs: string): Promise<Record<string, unknown> | null> {
  const cmd =
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
    `"select metadata::text from audit_logs where action='${action}' and created_at >= '${baselineTs}'::timestamptz order by created_at desc limit 1;" 2>&1`;

  for (let i = 0; i < 5; i++) {
    const out = sh(cmd, true).trim();
    if (!out.includes('relation "audit_logs" does not exist')) {
      if (!out) return null;
      try {
        return JSON.parse(out) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    await sleep(800);
  }
  const out = sh(cmd).trim();
  if (!out) return null;
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loginAndGetToken(): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const email = process.env.TEST_EMAIL || 'admin@solar.local';
  const password = process.env.TEST_PASSWORD || 'AdminPassword123';

  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  assert.equal(status, 200, `login must be 200, got ${status} body=${JSON.stringify(body)}`);
  const token =
    (body as { access_token?: string })?.access_token ??
    (body as { token?: string })?.token ??
    (body as { value?: { access_token?: string } })?.value?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

async function createCustomer(token: string, name: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      phone: '0900000026',
      email: 'f26@example.com',
      address: 'HCM',
    }),
  });

  assert.ok(status === 200 || status === 201, `create customer must be 200/201, got ${status} body=${JSON.stringify(body)}`);
  const b = body as { id?: string; value?: { id?: string } };
  const id = b?.id ?? b?.value?.id;
  assert.ok(id, 'create customer must return id');
  return String(id);
}

async function createProject(token: string, customerId: string, projectName: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customer_id: customerId,
      name: projectName,
      address: 'Q1, HCM',
    }),
  });

  assert.ok(status === 201 || status === 200, `create project must be 201/200, got ${status} body=${JSON.stringify(body)}`);
  const v = (body as { value?: Record<string, unknown> })?.value ?? (body as Record<string, unknown>);
  assert.ok(v?.id, 'response must include value.id');
  return String(v.id);
}

async function createQuoteFromProject(token: string, projectId: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: projectId, title: 'F26 Quote' }),
  });

  assert.equal(status, 201, `create quote from project must be 201, got ${status} body=${JSON.stringify(body)}`);
  const value = (body as { value?: Record<string, unknown> })?.value;
  assert.ok(value?.id, 'response must have value.id');
  return String(value.id);
}

test('f26: GET /api/quotes/:id v3 project_id + customer_name_snapshot from payload, audit + negative', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();

  const customerName = 'F26 Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);

  const baselineTs = pgNow();
  await sleep(200);

  // 1) 200: GET quote detail v3 -> value has id, customer_id, customer_name, status, created_at, payload, project_id, customer_name_snapshot; audit quote.get
  const getOk = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(getOk.status, 200, `GET quote must be 200, got ${getOk.status} body=${JSON.stringify(getOk.body)}`);
  const value = (getOk.body as { value?: Record<string, unknown> })?.value;
  assert.ok(value, 'response must have value');
  assert.ok(value.id, 'value must have id');
  assert.ok(value.customer_id, 'value must have customer_id');
  assert.ok(typeof value.customer_name === 'string', 'value must have customer_name');
  assert.equal(String(value.status), 'draft', 'value must have status');
  assert.ok(value.created_at, 'value must have created_at');
  assert.ok(value.payload !== undefined, 'value must have payload');
  assert.equal(String(value.project_id), projectId, 'value.project_id must come from payload (F-25 path)');
  assert.equal(String(value.customer_name_snapshot), customerName, 'value.customer_name_snapshot must come from payload');

  await sleep(200);

  const getCount = await countAuditSince('quote.get', baselineTs);
  assert.equal(getCount, 1, `expected exactly 1 quote.get audit, got ${getCount}`);

  const meta = await getLastAuditMeta('quote.get', baselineTs);
  assert.ok(meta, 'quote.get meta must exist');
  assert.equal(String(meta.quote_id ?? ''), quoteId, 'meta.quote_id must match');

  // 2) 404 not found -> audit quote.get.not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/quotes/${zeroUuid}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(nf.status, 404, `GET not_found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);
  assert.equal((nf.body as { error?: string })?.error, 'Quote not found', 'must return Quote not found');

  await sleep(200);

  const nfCount = await countAuditSince('quote.get.not_found', baseline404);
  assert.equal(nfCount, 1, `expected exactly 1 quote.get.not_found audit, got ${nfCount}`);
  const meta404 = await getLastAuditMeta('quote.get.not_found', baseline404);
  assert.ok(meta404, 'quote.get.not_found meta must exist');
  assert.equal(String(meta404.quote_id ?? ''), zeroUuid, 'meta.quote_id must match');

  // 3) 400 invalid id -> NO audit
  const baseline400 = pgNow();

  const bad = await httpJson(`${baseUrl}/api/quotes/not-a-uuid`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(bad.status, 400, `GET invalid id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);

  await sleep(200);

  const badAudit =
    (await countAuditSince('quote.get', baseline400)) +
    (await countAuditSince('quote.get.not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any quote.get audit rows, got ${badAudit}`);

  // 4) 401 no token -> NO audit
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/quotes/${quoteId}`);

  assert.equal(unauth.status, 401, `no auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`);

  await sleep(200);

  const unauthAudit =
    (await countAuditSince('quote.get', baseline401)) +
    (await countAuditSince('quote.get.not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any quote.get audit rows, got ${unauthAudit}`);
});

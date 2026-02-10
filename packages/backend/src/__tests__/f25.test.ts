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
      phone: '0900000025',
      email: 'f25@example.com',
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

test.skip('f25: POST /api/quotes v1 from project_id + customer_name snapshot + audit + negative', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();

  // Customer name must match project name so quote-from-project can resolve customer_id
  const customerName = 'F25 Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);

  await sleep(200);
  const baselineTs = pgNow();
  await sleep(200);

  // 1) 201: POST with project_id -> value { id, project_id, customer_name, status, created_at }, audit quote.create
  const ok = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: projectId, title: 'F25 Quote' }),
  });

  assert.equal(ok.status, 201, `create quote from project must be 201, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  const value = (ok.body as { value?: Record<string, unknown> })?.value;
  assert.ok(value, 'response must have value');
  assert.ok(value.id, 'value must have id');
  assert.equal(String(value.project_id), projectId, 'value.project_id must match');
  assert.equal(String(value.customer_name), customerName, 'value.customer_name must be snapshot from project');
  assert.equal(String(value.status), 'draft', 'value.status must be draft');
  assert.ok(value.created_at, 'value must have created_at');

  await sleep(200);

  const createCount = await countAuditSince('quote.create', baselineTs);
  assert.ok(createCount >= 1, `expected at least 1 quote.create audit after baseline, got ${createCount}`);

  const meta = await getLastAuditMeta('quote.create', baselineTs);
  assert.ok(meta, 'quote.create meta must exist');
  assert.ok(meta.quote_id, 'meta.quote_id must exist (UUID from created quote)');
  assert.ok(meta.project_id, 'meta.project_id must exist (UUID from request)');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.match(String(meta.quote_id ?? ''), uuidRegex, 'meta.quote_id must be valid UUID');
  assert.match(String(meta.project_id ?? ''), uuidRegex, 'meta.project_id must be valid UUID');

  // 2) 404 project not found (org-safe) -> audit quote.create.project_not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: zeroUuid }),
  });

  assert.equal(nf.status, 404, `project not found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);
  assert.equal((nf.body as { error?: string })?.error, 'Project not found', 'must return Project not found');

  await sleep(200);

  const nfCount = await countAuditSince('quote.create.project_not_found', baseline404);
  assert.ok(nfCount >= 1, `expected at least 1 quote.create.project_not_found audit after baseline, got ${nfCount}`);
  const meta404 = await getLastAuditMeta('quote.create.project_not_found', baseline404);
  assert.ok(meta404, 'quote.create.project_not_found meta must exist');
  assert.equal(String(meta404.project_id ?? ''), zeroUuid, 'meta.project_id must match');

  // 3) 400 invalid payload -> NO audit
  const baseline400 = pgNow();

  const bad = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: 'not-a-uuid' }),
  });

  assert.equal(bad.status, 400, `invalid project_id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);
  assert.equal((bad.body as { error?: string })?.error, 'invalid payload', 'must return invalid payload');

  await sleep(200);

  const badAudit =
    (await countAuditSince('quote.create', baseline400)) +
    (await countAuditSince('quote.create.project_not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any quote.create audit rows, got ${badAudit}`);

  // 4) 401 no token -> NO audit
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });

  assert.equal(unauth.status, 401, `no auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`);

  await sleep(200);

  const unauthAudit =
    (await countAuditSince('quote.create', baseline401)) +
    (await countAuditSince('quote.create.project_not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any quote.create audit rows, got ${unauthAudit}`);
});

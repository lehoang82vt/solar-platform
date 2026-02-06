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
  const token = (body as { access_token?: string })?.access_token ?? (body as { token?: string })?.token ?? (body as { value?: { access_token?: string } })?.value?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

async function createCustomer(token: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const payload = {
    name: 'F20 Customer',
    phone: '0900000020',
    email: 'f20@example.com',
    address: 'HCM',
  };

  const { status, body } = await httpJson(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  assert.ok(status === 200 || status === 201, `create customer must be 200/201, got ${status} body=${JSON.stringify(body)}`);
  const b = body as { id?: string; value?: { id?: string } };
  const id = b?.id ?? b?.value?.id;
  assert.ok(id, 'create customer must return id');
  return String(id);
}

test('f20: create project org-safe + audit + 400/404/401 no audit', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerId = await createCustomer(token);

  // 1) 201 success -> audit project.create
  const baselineTs = pgNow();

  const ok = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'F20 Project',
      address: 'Q1, HCM',
      notes: 'F20 notes',
    }),
  });

  assert.ok(ok.status === 201 || ok.status === 200, `create project must be 201/200, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  const v = (ok.body as { value?: Record<string, unknown> })?.value ?? (ok.body as Record<string, unknown>);
  assert.ok(v?.id, 'response must include value.id');
  assert.equal(String(v.customer_id), customerId, 'value.customer_id must match');
  assert.equal(String(v.name), 'F20 Project', 'value.name must match');
  if (v.status !== undefined && v.status !== null) {
    assert.equal(String(v.status), 'draft', 'value.status must default to draft');
  }

  await sleep(200);

  const c1 = await countAuditSince('project.create', baselineTs);
  assert.equal(c1, 1, `expected exactly 1 project.create audit after baselineTs, got ${c1}`);

  const meta1 = await getLastAuditMeta('project.create', baselineTs);
  assert.ok(meta1, 'project.create meta must exist');
  assert.equal(String(meta1.customer_id ?? ''), customerId, 'meta.customer_id must match');
  assert.ok(meta1.project_id, 'meta.project_id must exist');

  // 2) 404 customer not found in org -> audit project.create.customer_not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ customer_id: zeroUuid, name: 'NF Project' }),
  });

  assert.equal(nf.status, 404, `customer_not_found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);

  await sleep(200);

  const c2 = await countAuditSince('project.create.customer_not_found', baseline404);
  assert.equal(c2, 1, `expected exactly 1 project.create.customer_not_found audit, got ${c2}`);

  const meta2 = await getLastAuditMeta('project.create.customer_not_found', baseline404);
  assert.ok(meta2, 'customer_not_found meta must exist');
  assert.equal(String(meta2.customer_id ?? ''), zeroUuid, 'meta.customer_id must match');

  // 3) 400 invalid id -> no audit
  const baseline400 = pgNow();

  const bad = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ customer_id: 'not-a-uuid', name: 'Bad Project' }),
  });

  assert.equal(bad.status, 400, `invalid customer_id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);

  await sleep(200);

  const badAudit =
    (await countAuditSince('project.create', baseline400)) +
    (await countAuditSince('project.create.customer_not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any project.create audit rows, got ${badAudit}`);

  // 4) 401 no auth -> no audit
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, name: 'Unauth Project' }),
  });

  assert.equal(unauth.status, 401, `no auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`);

  await sleep(200);

  const unauthAudit =
    (await countAuditSince('project.create', baseline401)) +
    (await countAuditSince('project.create.customer_not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any project.create audit rows, got ${unauthAudit}`);
});

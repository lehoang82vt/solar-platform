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
    name: 'F22 Customer',
    phone: '0900000022',
    email: 'f22@example.com',
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

async function createProject(token: string, customerId: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'F22 Project',
      address: 'Q1, HCM',
      notes: 'F22 notes',
    }),
  });

  assert.ok(status === 201 || status === 200, `create project must be 201/200, got ${status} body=${JSON.stringify(body)}`);
  const v = (body as { value?: Record<string, unknown> })?.value ?? (body as Record<string, unknown>);
  assert.ok(v?.id, 'response must include value.id');
  return String(v.id);
}

test.skip('f22: PATCH project org-safe + audit + 400/404/401 no audit', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerId = await createCustomer(token);
  const projectId = await createProject(token, customerId);

  // 1) 200 patch name+address → expect 1 project.update + meta has project_id + changed_fields includes name, address
  const baselineTs = pgNow();

  const ok = await httpJson(`${baseUrl}/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'F22 Project Updated', address: 'Q2, HCM' }),
  });

  assert.equal(ok.status, 200, `PATCH must be 200, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  const valueId = (ok.body as { value?: { id?: string } })?.value?.id;
  assert.ok(valueId === projectId || valueId, 'response must return value.id');

  await sleep(200);

  const updCount = await countAuditSince('project.update', baselineTs);
  assert.equal(updCount, 1, `expected exactly 1 project.update audit after baselineTs, got ${updCount}`);

  const meta = await getLastAuditMeta('project.update', baselineTs);
  assert.ok(meta, 'project.update meta must exist');
  assert.equal(String(meta.project_id ?? ''), projectId, 'meta.project_id must match');
  const changed = (meta.changed_fields ?? meta.changedFields) as string[] | undefined;
  assert.ok(Array.isArray(changed), 'meta.changed_fields must be array');
  const set = new Set(changed.map((x) => String(x)));
  assert.ok(set.has('name'), 'changed_fields must include name');
  assert.ok(set.has('address'), 'changed_fields must include address');

  // 2) 404 patch zero-uuid → expect 1 project.update.not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/projects/${zeroUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'x' }),
  });

  assert.equal(nf.status, 404, `PATCH not_found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);
  assert.equal((nf.body as { error?: string })?.error, 'Project not found', 'must return Project not found');

  await sleep(200);

  const nfCount = await countAuditSince('project.update.not_found', baseline404);
  assert.equal(nfCount, 1, `expected exactly 1 project.update.not_found audit, got ${nfCount}`);
  const meta404 = await getLastAuditMeta('project.update.not_found', baseline404);
  assert.ok(meta404, 'project.update.not_found meta must exist');
  assert.equal(String(meta404.project_id ?? ''), zeroUuid, 'meta.project_id must match');

  // 3) 400 invalid id → audit count delta = 0
  const baseline400 = pgNow();

  const bad = await httpJson(`${baseUrl}/api/projects/not-a-uuid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'x' }),
  });

  assert.equal(bad.status, 400, `PATCH invalid id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);
  assert.equal((bad.body as { error?: string })?.error, 'invalid id', 'must return invalid id');

  await sleep(200);

  const badAudit =
    (await countAuditSince('project.update', baseline400)) +
    (await countAuditSince('project.update.not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any project.update audit rows, got ${badAudit}`);

  // 4) 401 no token → audit count delta = 0
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'unauth-try' }),
  });

  assert.equal(unauth.status, 401, `no auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`);

  await sleep(200);

  const unauthAudit =
    (await countAuditSince('project.update', baseline401)) +
    (await countAuditSince('project.update.not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any project.update audit rows, got ${unauthAudit}`);
});

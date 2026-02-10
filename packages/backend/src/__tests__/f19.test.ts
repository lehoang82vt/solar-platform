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
    name: 'F19 Customer',
    phone: '0900000002',
    email: 'f19@example.com',
    address: 'HCM',
  };

  const { status, body } = await httpJson(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  assert.ok(status === 200 || status === 201, `create customer must be 200/201, got ${status} body=${JSON.stringify(body)}`);
  const b = body as { id?: string; value?: { id?: string; customer?: { id?: string } } };
  const id = b?.id ?? b?.value?.id ?? b?.value?.customer?.id;
  assert.ok(id, 'create customer must return id');
  return String(id);
}

test.skip('f19: get customer detail org-safe + audit + 400/404/401 no audit', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  const token = await loginAndGetToken();
  const customerId = await createCustomer(token);

  // 1) 200 OK: GET customer detail -> audit customer.get with customer_id
  const baselineTs = pgNow();

  const ok = await httpJson(`${baseUrl}/api/customers/${customerId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(ok.status, 200, `GET must be 200, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  const v = (ok.body as { value?: unknown })?.value ?? ok.body;
  assert.ok(v, 'response must have value');
  assert.equal(String((v as { id?: unknown }).id), customerId, 'value.id must match');
  assert.ok('name' in (v as object), 'value must include name');
  assert.ok('phone' in (v as object), 'value must include phone');
  assert.ok('email' in (v as object), 'value must include email');
  assert.ok('address' in (v as object), 'value must include address');

  await sleep(200);

  const getCount = await countAuditSince('customer.get', baselineTs);
  assert.equal(getCount, 1, `expected exactly 1 customer.get audit after baselineTs, got ${getCount}`);

  const meta = await getLastAuditMeta('customer.get', baselineTs);
  assert.ok(meta, 'customer.get meta must exist');
  assert.equal(String(meta.customer_id ?? (meta as { customerId?: string }).customerId ?? ''), customerId, 'meta.customer_id must match');

  // 2) 404: not found (valid UUID). Must audit customer.get.not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/customers/${zeroUuid}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(nf.status, 404, `GET not_found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);

  await sleep(200);

  const nfCount = await countAuditSince('customer.get.not_found', baseline404);
  assert.equal(nfCount, 1, `expected exactly 1 customer.get.not_found audit, got ${nfCount}`);

  const meta404 = await getLastAuditMeta('customer.get.not_found', baseline404);
  assert.ok(meta404, 'customer.get.not_found meta must exist');
  assert.equal(String(meta404.customer_id ?? (meta404 as { customerId?: string }).customerId ?? ''), zeroUuid, 'meta.customer_id must match');

  // 3) 400: invalid id. Must NOT audit.
  const baseline400 = pgNow();

  const bad = await httpJson(`${baseUrl}/api/customers/not-a-uuid`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(bad.status, 400, `GET invalid id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);

  await sleep(200);

  const badAudit =
    (await countAuditSince('customer.get', baseline400)) + (await countAuditSince('customer.get.not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any get audit rows, got ${badAudit}`);

  // 4) 401: no auth. Must NOT audit.
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/customers/${customerId}`, {
    method: 'GET',
  });

  assert.equal(unauth.status, 401, `GET without auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`);

  await sleep(200);

  const unauthAudit =
    (await countAuditSince('customer.get', baseline401)) + (await countAuditSince('customer.get.not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any get audit rows, got ${unauthAudit}`);
});

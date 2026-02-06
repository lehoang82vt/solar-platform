import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

type JsonResp = { status: number; body: unknown };

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

async function httpJson(url: string, options?: RequestInit): Promise<JsonResp> {
  const res = await fetch(url, options);
  let body: unknown = null;
  const text = await res.text();
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
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const out = sh(cmd).trim();
      return parseInt(out || '0', 10);
    } catch (e: unknown) {
      const msg = String((e as { stdout?: string })?.stdout ?? (e as Error)?.message ?? '');
      if (attempt < 4 && msg.includes('does not exist')) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw e;
    }
  }
  return 0;
}

async function getLastAuditMeta(action: string, baselineTs: string): Promise<Record<string, unknown> | null> {
  const cmd =
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
    `"select metadata::text from audit_logs where action='${action}' and created_at >= '${baselineTs}'::timestamptz order by created_at desc limit 1;" 2>&1`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const out = sh(cmd).trim();
      if (!out) return null;
      return JSON.parse(out) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = String((e as { stdout?: string })?.stdout ?? (e as Error)?.message ?? '');
      if (attempt < 4 && msg.includes('does not exist')) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      if (msg.includes('does not exist')) return null;
      throw e;
    }
  }
  return null;
}

async function loginAndGetToken(): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@solar.local', password: 'AdminPassword123' }),
  });

  assert.equal(status, 200, `login must be 200, got ${status} body=${JSON.stringify(body)}`);
  const token = (body as { access_token?: string })?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

async function createCustomer(token: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const payload = {
    name: 'F18 Customer',
    phone: '0900000001',
    email: 'f18@example.com',
    address: 'HN',
  };

  const { status, body } = await httpJson(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  assert.equal(status, 201, `create customer must be 201, got ${status} body=${JSON.stringify(body)}`);
  const id = (body as { id?: string })?.id;
  assert.ok(id, 'create customer must return id');
  return String(id);
}

test('f18: update customer org-safe + audit + 400/404/401 no audit', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  const token = await loginAndGetToken();
  const customerId = await createCustomer(token);

  // 1) 200 OK: PATCH customer with allowed fields; must audit customer.update with changed_fields + customer_id
  const baselineTs = pgNow();

  const patchPayload = {
    name: 'F18 Customer Updated',
    phone: '0900000099',
    email: 'f18-updated@example.com',
  };

  const ok = await httpJson(`${baseUrl}/api/customers/${customerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patchPayload),
  });

  assert.equal(ok.status, 200, `PATCH must be 200, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  const valueId = (ok.body as { value?: { id?: string } })?.value?.id;
  assert.ok(valueId === customerId || valueId, 'response must return value.id');

  await new Promise((r) => setTimeout(r, 200));

  const updCount = await countAuditSince('customer.update', baselineTs);
  assert.equal(updCount, 1, `expected exactly 1 customer.update audit after baselineTs, got ${updCount}`);

  const meta = await getLastAuditMeta('customer.update', baselineTs);
  assert.ok(meta, 'customer.update meta must exist');
  assert.equal(String(meta.customer_id ?? meta.customerId ?? ''), customerId, 'meta.customer_id must match');

  const changed = (meta.changed_fields ?? meta.changedFields) as string[] | undefined;
  assert.ok(Array.isArray(changed), 'meta.changed_fields must be array');
  const set = new Set(changed.map((x) => String(x)));
  assert.ok(set.has('name'), 'changed_fields must include name');
  assert.ok(set.has('phone'), 'changed_fields must include phone');
  assert.ok(set.has('email'), 'changed_fields must include email');

  // 2) 404: not found (UUID but not existing). Must audit customer.update.not_found
  const baseline404 = pgNow();
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  const nf = await httpJson(`${baseUrl}/api/customers/${zeroUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'x' }),
  });

  assert.equal(nf.status, 404, `PATCH not_found must be 404, got ${nf.status} body=${JSON.stringify(nf.body)}`);

  await new Promise((r) => setTimeout(r, 200));

  const nfCount = await countAuditSince('customer.update.not_found', baseline404);
  assert.equal(nfCount, 1, `expected exactly 1 customer.update.not_found audit, got ${nfCount}`);
  const meta404 = await getLastAuditMeta('customer.update.not_found', baseline404);
  assert.ok(meta404, 'customer.update.not_found meta must exist');
  assert.equal(String(meta404.customer_id ?? meta404.customerId ?? ''), zeroUuid, 'meta.customer_id must match');

  // 3) 400: invalid id. Must NOT audit.
  const baseline400 = pgNow();
  const bad = await httpJson(`${baseUrl}/api/customers/not-a-uuid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'x' }),
  });

  assert.equal(bad.status, 400, `PATCH invalid id must be 400, got ${bad.status} body=${JSON.stringify(bad.body)}`);

  await new Promise((r) => setTimeout(r, 200));

  const badAudit =
    (await countAuditSince('customer.update', baseline400)) +
    (await countAuditSince('customer.update.not_found', baseline400));
  assert.equal(badAudit, 0, `400 must not add any update audit rows, got ${badAudit}`);

  // 4) 401: no auth. Must NOT audit.
  await new Promise((r) => setTimeout(r, 200));
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/customers/${customerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'unauth-try' }),
  });

  assert.equal(
    unauth.status,
    401,
    `PATCH without auth must be 401, got ${unauth.status} body=${JSON.stringify(unauth.body)}`
  );

  await new Promise((r) => setTimeout(r, 200));

  const unauthAudit =
    (await countAuditSince('customer.update', baseline401)) +
    (await countAuditSince('customer.update.not_found', baseline401));
  assert.equal(unauthAudit, 0, `401 must not add any update audit rows, got ${unauthAudit}`);
});

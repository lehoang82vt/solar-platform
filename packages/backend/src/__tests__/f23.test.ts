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

test('f23: GET /api/projects list v2 limit/offset + name from customer_name + audit on 200 only', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();

  const baselineTs = pgNow();
  await sleep(200);

  // 1) 200: GET with limit/offset -> value is ProjectListItem[], audit project.list with limit, offset, result_count
  const list = await httpJson(`${baseUrl}/api/projects?limit=20&offset=0`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(list.status, 200, `list must be 200, got ${list.status} body=${JSON.stringify(list.body)}`);
  const value = (list.body as { value?: unknown[] })?.value;
  assert.ok(Array.isArray(value), 'response must have value array');
  for (const item of value as { id?: string; customer_id: unknown; name?: string; address?: unknown; status?: string; created_at?: string }[]) {
    assert.ok(typeof item.id === 'string', 'item must have id');
    assert.strictEqual(item.customer_id, null, 'item.customer_id must be null');
    assert.ok(typeof item.name === 'string', 'item must have name (from customer_name)');
    assert.ok(item.address === null || typeof item.address === 'string', 'item.address must be string or null');
    assert.equal(item.status, 'draft', 'item.status must be draft');
    assert.ok(typeof item.created_at === 'string', 'item must have created_at');
  }

  await sleep(200);

  const listCount = await countAuditSince('project.list', baselineTs);
  assert.equal(listCount, 1, `expected exactly 1 project.list audit after 200, got ${listCount}`);

  const meta = await getLastAuditMeta('project.list', baselineTs);
  assert.ok(meta, 'project.list meta must exist');
  assert.equal(meta.limit, 20, 'meta.limit must be 20');
  assert.equal(meta.offset, 0, 'meta.offset must be 0');
  assert.ok(typeof meta.result_count === 'number', 'meta.result_count must be number');

  // 2) 400 invalid query -> NO audit
  const baseline400 = pgNow();

  const badLimit = await httpJson(`${baseUrl}/api/projects?limit=101&offset=0`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(badLimit.status, 400, `limit>100 must be 400, got ${badLimit.status}`);
  assert.equal((badLimit.body as { error?: string })?.error, 'invalid query', 'must return invalid query');

  const badOffset = await httpJson(`${baseUrl}/api/projects?limit=20&offset=-1`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(badOffset.status, 400, `offset negative must be 400, got ${badOffset.status}`);
  assert.equal((badOffset.body as { error?: string })?.error, 'invalid query', 'must return invalid query');

  const badNaN = await httpJson(`${baseUrl}/api/projects?limit=abc&offset=0`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(badNaN.status, 400, `limit NaN must be 400, got ${badNaN.status}`);
  assert.equal((badNaN.body as { error?: string })?.error, 'invalid query', 'must return invalid query');

  await sleep(200);

  const badAudit = await countAuditSince('project.list', baseline400);
  assert.equal(badAudit, 0, `400 must not add any project.list audit, got ${badAudit}`);

  // 3) 401 no token -> NO audit
  await sleep(200);
  const baseline401 = pgNow();

  const unauth = await httpJson(`${baseUrl}/api/projects?limit=20&offset=0`);
  assert.equal(unauth.status, 401, `no auth must be 401, got ${unauth.status}`);

  await sleep(200);

  const unauthAudit = await countAuditSince('project.list', baseline401);
  assert.equal(unauthAudit, 0, `401 must not add any project.list audit, got ${unauthAudit}`);
});

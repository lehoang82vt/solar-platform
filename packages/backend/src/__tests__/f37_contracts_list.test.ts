import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

type JsonResp = { status: number; body: unknown };

interface ContractListRow {
  id: string;
  contract_number?: string;
  project?: { id?: string };
}

interface PagingInfo {
  limit?: number;
  offset?: number;
  count?: number;
}

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  for (let i = 0; i < 3; i++) {
    const out = sh(cmd, true);
    if (!out.includes('relation "audit_logs" does not exist')) {
      return parseInt(String(out).trim() || '0', 10);
    }
    await sleep(500);
  }
  const out = sh(cmd).trim();
  return parseInt(out || '0', 10);
}

async function loginAndGetToken(): Promise<string> {
  const email = process.env.TEST_EMAIL || 'admin@solar.local';
  const password = process.env.TEST_PASSWORD || 'AdminPassword123';
  const { status, body } = await httpJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(status, 200, `login must be 200, got ${status} body=${JSON.stringify(body)}`);
  const token = (body as { access_token?: string })?.access_token ??
    (body as { token?: string })?.token ??
    (body as { value?: { access_token?: string } })?.value?.access_token;
  assert.ok(token, 'login must return access_token');
  return String(token);
}

async function createCustomer(token: string, name: string): Promise<string> {
  const payload = { name, phone: '0900000007', email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`, address: 'HCM' };
  const { status, body } = await httpJson(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  assert.ok(status === 200 || status === 201, `create customer 200/201, got ${status} body=${JSON.stringify(body)}`);
  const parsed = body as { id?: string; value?: { id?: string } };
  const id = parsed?.id ?? parsed?.value?.id;
  assert.ok(id, 'customer id must be returned');
  return String(id);
}

async function createProject(token: string, customerId: string, name: string): Promise<string> {
  const { status, body } = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ customer_id: customerId, name, address: 'District 1' }),
  });
  assert.ok(status === 200 || status === 201, `create project 200/201, got ${status}`);
  const value = (body as { value?: { id?: string } })?.value ?? (body as { id?: string });
  const id = value?.id;
  assert.ok(id, 'project id must be returned');
  return String(id);
}

async function createQuote(token: string, projectId: string): Promise<string> {
  const { status, body } = await httpJson(`${baseUrl}/api/projects/${projectId}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: `F37 quote for ${projectId}` }),
  });
  assert.equal(status, 201, `create quote 201, got ${status}`);
  const value = (body as { value?: { id?: string } })?.value;
  const quote = value as { id?: string } | undefined;
  const id = quote?.id;
  assert.ok(id, 'quote id expected');
  return String(id);
}

async function ensureQuotePriceTotal(token: string, quoteId: string, priceTotal: number): Promise<void> {
  const { status, body } = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200, `get quote 200, got ${status}`);
  const existingPayload = ((body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await httpJson(`${baseUrl}/api/quotes/${quoteId}/payload`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ payload: { ...existingPayload, price_total: priceTotal } }),
  });
}

async function updateQuoteStatus(token: string, quoteId: string, status: string): Promise<void> {
  const res = await httpJson(`${baseUrl}/api/quotes/${quoteId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  assert.equal(res.status, 200, `update quote status must be 200, got ${res.status}`);
}

async function createContractFromQuote(token: string, projectId: string, quoteId: string): Promise<{ id: string; contract_number: string; project_id: string }> {
  const res = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [
        { milestone: 'A', pct: 50 },
        { milestone: 'B', pct: 50 },
      ],
    }),
  });
  assert.equal(res.status, 201, `create contract must be 201, got ${res.status}`);
  const value = (res.body as { value?: Record<string, unknown> })?.value ?? res.body;
  const contract = value as { id?: string; contract_number?: string; project_id?: string };
  assert.ok(contract.id, 'contract id expected');
  assert.ok(contract.contract_number, 'contract number expected');
  assert.ok(contract.project_id, 'contract project_id expected');
  return {
    id: String(contract.id),
    contract_number: String(contract.contract_number),
    project_id: String(contract.project_id),
  };
}

async function prepareContract(token: string, projectId: string, priceTotal: number) {
  const quoteId = await createQuote(token, projectId);
  await ensureQuotePriceTotal(token, quoteId, priceTotal);
  await updateQuoteStatus(token, quoteId, 'accepted');
  return await createContractFromQuote(token, projectId, quoteId);
}

test.skip('f37: contracts list v2 uses pagination, filters, and audits correctly', async () => {
  const token = await loginAndGetToken();
  const customerId = await createCustomer(token, 'F37 Customer');
  const projectA = await createProject(token, customerId, 'F37 Project A');
  const projectB = await createProject(token, customerId, 'F37 Project B');
  const contractA = await prepareContract(token, projectA, 1200000);
  const _contractB = await prepareContract(token, projectB, 2500000);
  void _contractB;

  await sleep(200);
  const baselineTs = pgNow();
  await sleep(200);

  const page0 = await httpJson(`${baseUrl}/api/contracts/v2?limit=1&offset=0`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(page0.status, 200, `limit=1 offset=0 must be 200, got ${page0.status}`);
  const page0Body = page0.body as { value?: ContractListRow[]; paging?: PagingInfo };
  assert.ok(Array.isArray(page0Body.value), 'page0 must have value array');
  assert.equal(page0Body.paging?.limit, 1);
  assert.equal(page0Body.paging?.offset, 0);
  assert.ok(Number(page0Body.paging?.count) >= 2, 'paging.count must reflect at least 2 contracts');
  const firstItem = page0Body.value?.[0];
  assert.ok(firstItem && firstItem.id, 'first item must exist');
  const firstId = firstItem?.id as string;
  const page1 = await httpJson(`${baseUrl}/api/contracts/v2?limit=1&offset=1`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(page1.status, 200);
  const page1Body = page1.body as { value?: ContractListRow[]; paging?: PagingInfo };
  assert.ok(Array.isArray(page1Body.value));
  assert.equal(page1Body.paging?.limit, 1);
  assert.equal(page1Body.paging?.offset, 1);
  assert.ok(page1Body.value?.length === 1, 'second page should expose a contract');
  const secondId = page1Body.value?.[0]?.id;
  assert.ok(secondId && secondId !== firstId, 'page1 should show a different contract than page0');

  const byProject = await httpJson(`${baseUrl}/api/contracts/v2?limit=20&offset=0&project_id=${projectA}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(byProject.status, 200);
  const projectBody = byProject.body as { value?: ContractListRow[]; paging?: PagingInfo };
  assert.ok(Array.isArray(projectBody.value));
  assert.ok(projectBody.value!.length >= 1, 'project filter should return at least one contract');
  for (const row of projectBody.value ?? []) {
    const item = row as { project?: { id?: string } };
    assert.equal(item.project?.id, projectA, 'project filter must only return matching project_id');
  }

  const searchRes = await httpJson(`${baseUrl}/api/contracts/v2?limit=20&offset=0&search=${encodeURIComponent(contractA.contract_number)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(searchRes.status, 200);
  const searchBody = searchRes.body as { value?: ContractListRow[] };
  assert.ok(Array.isArray(searchBody.value));
  assert.ok(searchBody.value!.some((item) => item.id === contractA.id), 'search by contract number must include contract A');

  const auditCountAfterLists = await countAuditSince('contract.listed', baselineTs);
  assert.equal(auditCountAfterLists, 4, 'four successful list requests must create exactly 4 contract.listed audit rows');

  const invalid = await httpJson(`${baseUrl}/api/contracts/v2?limit=0&offset=0`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(invalid.status, 400, 'limit < 1 must return 400');
  const auditAfter400 = await countAuditSince('contract.listed', baselineTs);
  assert.equal(auditAfter400, 4, '400 list call must not add audit rows');

  const unauth = await httpJson(`${baseUrl}/api/contracts/v2?limit=1&offset=0`, {
    method: 'GET',
  });
  assert.equal(unauth.status, 401, 'unauthorized list must return 401');
  const auditAfter401 = await countAuditSince('contract.listed', baselineTs);
  assert.equal(auditAfter401, 4, '401 list call must not add audit rows');
});
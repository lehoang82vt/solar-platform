/**
 * F27/F-36: Contract lifecycle – create from APPROVED quote, state machine DRAFT→REVIEWING→APPROVED→SIGNED→COMPLETED.
 * PASS: A create+auto-number, B transition REVIEWING→APPROVED, C sign (APPROVED→SIGNED), D transition COMPLETED,
 *       E negative (wrong-order transition, PATCH when SIGNED), F audit contract.status.changed.
 */
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
  return parseInt(sh(cmd).trim() || '0', 10);
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
    body: JSON.stringify({ name, phone: '0900000027', email: 'f27@example.com', address: 'HCM' }),
  });
  assert.ok(status === 200 || status === 201, `create customer 200/201, got ${status}`);
  const b = body as { id?: string; value?: { id?: string } };
  return String(b?.id ?? b?.value?.id);
}

async function createProject(token: string, customerId: string, projectName: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ customer_id: customerId, name: projectName, address: 'Q1, HCM' }),
  });
  assert.ok(status === 201 || status === 200, `create project 201/200, got ${status}`);
  const v = (body as { value?: Record<string, unknown> })?.value ?? (body as Record<string, unknown>);
  return String(v?.id);
}

async function createQuoteFromProject(token: string, projectId: string): Promise<string> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status, body } = await httpJson(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: projectId, title: 'F27 Quote' }),
  });
  assert.equal(status, 201, `create quote 201, got ${status} body=${JSON.stringify(body)}`);
  const value = (body as { value?: Record<string, unknown> })?.value;
  return String(value?.id);
}

async function updateQuotePayload(token: string, quoteId: string, payload: Record<string, unknown>): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const { status } = await httpJson(`${baseUrl}/api/quotes/${quoteId}/payload`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ payload }),
  });
  assert.equal(status, 200, 'PATCH quote payload must be 200');
}

async function updateQuoteStatus(token: string, quoteId: string, status: string): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const res = await httpJson(`${baseUrl}/api/quotes/${quoteId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  assert.equal(res.status, 200, `PATCH quote status must be 200, got ${res.status}`);
}

test('f27: Contract lifecycle create, sign, transition, negatives, audit', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerName = 'F27 Contract Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);

  // Get quote to keep project_id in payload when updating
  const getQuote = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getQuote.status, 200);
  const existingPayload = ((getQuote.body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await updateQuotePayload(token, quoteId, { ...existingPayload, price_total: 150000000 });
  await updateQuoteStatus(token, quoteId, 'accepted');

  const baselineTs = pgNow();
  await sleep(200);

  // A. Create contract OK + auto-number
  const createRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [
        { milestone: 'Ký hợp đồng', pct: 50 },
        { milestone: 'Hoàn tất lắp đặt', pct: 40 },
        { milestone: 'Nghiệm thu', pct: 10 },
      ],
    }),
  });
  assert.equal(createRes.status, 201);
  const contract = (createRes.body as { value?: Record<string, unknown> })?.value;
  assert.ok(contract, 'contract value must exist');
  const contractId = String(contract?.id);
  const contractNumber = String(contract?.contract_number);
  assert.ok(contractNumber.match(/^HD-\d{4}-\d{3}$/), `contract_number format must be HD-YYYY-NNN, got ${contractNumber}`);
  assert.equal(String(contract?.status).toUpperCase(), 'DRAFT', 'initial status must be DRAFT');

  // B. Transition DRAFT -> REVIEWING -> APPROVED
  const toReviewing = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'REVIEWING' }),
  });
  assert.equal(toReviewing.status, 200);
  assert.equal(String((toReviewing.body as { value?: { status?: string } })?.value?.status).toUpperCase(), 'REVIEWING');

  const toApproved = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'APPROVED' }),
  });
  assert.equal(toApproved.status, 200);
  assert.equal(String((toApproved.body as { value?: { status?: string } })?.value?.status).toUpperCase(), 'APPROVED');

  // C. Sign (APPROVED -> SIGNED)
  const signRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(signRes.status, 200, `sign must be 200, got ${signRes.status} body=${JSON.stringify(signRes.body)}`);
  const signed = (signRes.body as { value?: Record<string, unknown> })?.value;
  assert.equal(String(signed?.status).toUpperCase(), 'SIGNED', 'status must be SIGNED');
  assert.ok(signed?.signed_at, 'must have signed_at');

  // D. Transition SIGNED -> COMPLETED
  const completeRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'COMPLETED' }),
  });
  assert.equal(completeRes.status, 200);
  assert.equal(String((completeRes.body as { value?: { status?: string } })?.value?.status).toUpperCase(), 'COMPLETED');

  await sleep(200);
  const statusChangedAudit = await countAuditSince('contract.status.changed', baselineTs);
  assert.ok(statusChangedAudit >= 4, `expected at least 4 contract.status.changed, got ${statusChangedAudit}`);
});

test('f27: Negative – create from non-APPROVED quote fails', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerName = 'F27 Neg Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);
  // quote stays draft; do not set accepted
  const getQuote = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const existingPayload = ((getQuote.body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await updateQuotePayload(token, quoteId, { ...existingPayload, price_total: 100 });

  const res = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [{ milestone: 'Full', pct: 100 }],
    }),
  });
  assert.ok(res.status === 403 || res.status === 422, `create from draft quote must fail 403/422, got ${res.status}`);
  assert.ok((res.body as { error?: string })?.error?.toLowerCase().includes('approved') || (res.body as { error?: string })?.error, 'error message expected');
});

test('f27: Negative – payment_terms pct sum ≠ 100 fails 400', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerName = 'F27 Neg Pct Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);
  const getQuote = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const existingPayload = ((getQuote.body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await updateQuotePayload(token, quoteId, { ...existingPayload, price_total: 200 });
  await updateQuoteStatus(token, quoteId, 'accepted');

  const res = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [
        { milestone: 'A', pct: 50 },
        { milestone: 'B', pct: 40 },
      ],
    }),
  });
  assert.equal(res.status, 400, `payment_terms sum must equal 100, got ${res.status} body=${JSON.stringify(res.body)}`);
});

test('f27: Negative – wrong-order transition rejected 409', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerName = 'F27 Neg Transition Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);
  const getQuote = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const existingPayload = ((getQuote.body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await updateQuotePayload(token, quoteId, { ...existingPayload, price_total: 300 });
  await updateQuoteStatus(token, quoteId, 'accepted');

  const createRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [{ milestone: 'Full', pct: 100 }],
    }),
  });
  assert.equal(createRes.status, 201);
  const contractId = String((createRes.body as { value?: { id?: string } })?.value?.id);
  // DRAFT -> APPROVED is invalid (must go DRAFT -> REVIEWING -> APPROVED)
  const wrongOrder = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'APPROVED' }),
  });
  assert.ok(wrongOrder.status === 400 || wrongOrder.status === 409, `wrong-order transition must 400/409, got ${wrongOrder.status}`);
});

test('f27: Negative – PATCH when SIGNED/COMPLETED fails 409 (locked)', async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const token = await loginAndGetToken();
  const customerName = 'F27 Neg Locked Customer';
  const customerId = await createCustomer(token, customerName);
  const projectId = await createProject(token, customerId, customerName);
  const quoteId = await createQuoteFromProject(token, projectId);
  const getQuote = await httpJson(`${baseUrl}/api/quotes/${quoteId}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const existingPayload = ((getQuote.body as { value?: { payload?: Record<string, unknown> } })?.value?.payload) ?? {};
  await updateQuotePayload(token, quoteId, { ...existingPayload, price_total: 400 });
  await updateQuoteStatus(token, quoteId, 'accepted');

  const createRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quote_id: quoteId,
      payment_terms: [{ milestone: 'Full', pct: 100 }],
    }),
  });
  assert.equal(createRes.status, 201);
  const contractId = String((createRes.body as { value?: { id?: string } })?.value?.id);
  
  // Transition DRAFT -> REVIEWING
  const toReviewing = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'REVIEWING' }),
  });
  assert.equal(toReviewing.status, 200, `transition to REVIEWING must be 200, got ${toReviewing.status}`);
  
  // Transition REVIEWING -> APPROVED
  const toApproved = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to_status: 'APPROVED' }),
  });
  assert.equal(toApproved.status, 200, `transition to APPROVED must be 200, got ${toApproved.status}`);
  
  // Sign contract (APPROVED -> SIGNED) - CRITICAL FIX: NOW CHECKING RESPONSE
  const signRes = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}/sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(signRes.status, 200, `sign must be 200, got ${signRes.status} body=${JSON.stringify(signRes.body)}`);
  const signedContract = (signRes.body as { value?: { status?: string; id?: string } })?.value;
  assert.ok(signedContract, 'sign response must have value');
  assert.equal(
    String(signedContract?.status).toUpperCase(),
    'SIGNED',
    `contract must be SIGNED after sign, got ${signedContract?.status}`
  );

  // NOW PATCH when SIGNED - this MUST return 409
  const patchLocked = await httpJson(`${baseUrl}/api/projects/${projectId}/contracts/${contractId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ warranty_terms: 'any' }),
  });
  assert.equal(
    patchLocked.status,
    409,
    `PATCH when SIGNED must 409 (locked), got ${patchLocked.status} body=${JSON.stringify(patchLocked.body)}`
  );
});

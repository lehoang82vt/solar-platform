/**
 * PUB-04: Lead creation after OTP verify.
 * Requires: DB running, migrations 014 + 015 applied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createOTPChallenge, verifyOTP } from '../services/otp';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

function sh(cmd: string, allowFail = false): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err: unknown) {
    if (allowFail) return '';
    throw err;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test.before(async () => {
  await connectDatabase();
});

test('test_pub04_1: otp_verify_creates_lead', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234101';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp);

  assert.equal(result.success, true);
  assert.ok(result.lead_id);
});

test('test_pub04_2: lead_status_is_received', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234102';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp);

  const status = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT status FROM leads WHERE id='${result.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.equal(status, 'RECEIVED');
});

test('test_pub04_3: lead_has_phone_e164', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234103';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp);

  const storedPhone = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT phone FROM leads WHERE id='${result.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.ok(storedPhone.startsWith('+84'));
});

test('test_pub04_4: lead_has_ref_partner_code', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234104';
  const partnerCode = 'PARTNER_ABC';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp, partnerCode);

  const partner = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT partner_code FROM leads WHERE id='${result.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.equal(partner, partnerCode);
});

test('test_pub04_5: first_touch_attribution_set', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234105';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp, 'FIRST_PARTNER');

  const firstTouch = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT first_touch_partner FROM leads WHERE id='${result.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.equal(firstTouch, 'FIRST_PARTNER');
});

test('test_pub04_6: second_partner_click_ignored', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234106';

  const { otp: otp1 } = await createOTPChallenge(orgId, phone);
  const result1 = await verifyOTP(orgId, phone, otp1, 'PARTNER_A');

  await sleep(100);

  const { otp: otp2 } = await createOTPChallenge(orgId, phone);
  const result2 = await verifyOTP(orgId, phone, otp2, 'PARTNER_B');

  assert.equal(result1.lead_id, result2.lead_id);

  const firstTouch = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT first_touch_partner FROM leads WHERE id='${result1.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.equal(firstTouch, 'PARTNER_A');
});

test('test_pub04_7: lead_without_partner_allowed', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234107';

  const { otp } = await createOTPChallenge(orgId, phone);
  const result = await verifyOTP(orgId, phone, otp);

  assert.ok(result.lead_id);

  const partner = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT partner_code FROM leads WHERE id='${result.lead_id}';" 2>&1`,
    true
  ).trim();

  assert.ok(!partner || partner === '');
});

test('test_pub04_8: audit_log_created', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = '+84901234108';

  const baseline = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc "select now();" 2>&1`,
    true
  ).trim();

  await sleep(200);

  const { otp } = await createOTPChallenge(orgId, phone);
  await verifyOTP(orgId, phone, otp);

  await sleep(200);

  const count = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT count(*) FROM audit_logs WHERE action='lead.created' AND created_at >= '${baseline}'::timestamptz;" 2>&1`,
    true
  ).trim();

  assert.ok(parseInt(count, 10) >= 1);
});

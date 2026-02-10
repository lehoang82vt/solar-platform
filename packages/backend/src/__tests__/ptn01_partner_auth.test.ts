/**
 * PTN-01: Partner authentication tests.
 * Requires: DB running, migration 016 applied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import {
  createPartner,
  loginPartner,
  verifyPartnerToken,
  validateReferralCode,
} from '../services/partners';
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

function uniquePartner(prefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `${prefix}-${suffix}@test.com`,
    referral_code: `${prefix}_${suffix}`.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
  };
}

test.before(async () => {
  await connectDatabase();
});

test('test_ptn01_1: valid_login_returns_jwt', async () => {
  const orgId = await getDefaultOrganizationId();
  const { email, referral_code } = uniquePartner('partner1');

  await createPartner(orgId, {
    email,
    password: 'password123',
    referral_code,
    name: 'Test Partner 1',
  });

  const result = await loginPartner(orgId, {
    email,
    password: 'password123',
  });

  assert.ok(result);
  assert.ok(result.token);
  assert.equal(result.partner.email, email);
});

test('test_ptn01_2: wrong_password_401', async () => {
  const orgId = await getDefaultOrganizationId();
  const { email, referral_code } = uniquePartner('partner2');

  await createPartner(orgId, {
    email,
    password: 'correctpass',
    referral_code,
    name: 'Test Partner 2',
  });

  const result = await loginPartner(orgId, {
    email,
    password: 'wrongpass',
  });

  assert.equal(result, null);
});

test('test_ptn01_3: inactive_partner_403', async () => {
  const orgId = await getDefaultOrganizationId();
  const { email, referral_code } = uniquePartner('partner3');

  const partner = await createPartner(orgId, {
    email,
    password: 'password123',
    referral_code,
    name: 'Test Partner 3',
  });

  sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c ` +
      `"UPDATE partners SET status = 'INACTIVE' WHERE id = '${partner.id}';" 2>&1`,
    true
  );

  await assert.rejects(
    async () => {
      await loginPartner(orgId, {
        email,
        password: 'password123',
      });
    },
    (error: Error) => {
      assert.ok(error.message.includes('not active'));
      return true;
    }
  );
});

test('test_ptn01_4: jwt_contains_partner_id_org_id', async () => {
  const orgId = await getDefaultOrganizationId();
  const { email, referral_code } = uniquePartner('partner4');

  const partner = await createPartner(orgId, {
    email,
    password: 'password123',
    referral_code,
    name: 'Test Partner 4',
  });

  const result = await loginPartner(orgId, {
    email,
    password: 'password123',
  });

  assert.ok(result);

  const decoded = verifyPartnerToken(result.token);
  assert.ok(decoded);
  assert.equal(decoded.partner_id, partner.id);
  assert.equal(decoded.organization_id, orgId);
  assert.equal(decoded.email, email);
  assert.equal(decoded.role, 'PARTNER');
});

test('test_ptn01_5: referral_code_validated', async () => {
  const orgId = await getDefaultOrganizationId();
  const { email, referral_code } = uniquePartner('partner5');

  await createPartner(orgId, {
    email,
    password: 'password123',
    referral_code,
    name: 'Test Partner 5',
  });

  const valid = await validateReferralCode(orgId, referral_code);
  assert.equal(valid, true);

  const invalid = await validateReferralCode(orgId, 'INVALID_CODE_XYZ');
  assert.equal(invalid, false);
});

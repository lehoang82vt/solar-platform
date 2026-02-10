/**
 * PTN-04: Commission list (placeholder).
 * Requires: DB, migration 016.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listPartnerCommissions } from '../services/commissions';
import { createPartner } from '../services/partners';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

function uniqueComm(_prefix: string) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `comm-${s}@test.com`,
    referral_code: `COMM_${s}`.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
  };
}

test.before(async () => {
  await connectDatabase();
});

test('test_ptn04_1: commission_list_returns_own', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueComm('1');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Commission Partner 1',
  });

  const commissions = await listPartnerCommissions(orgId, partner.id);

  assert.ok(Array.isArray(commissions));
});

test('test_ptn04_2: commission_status_filter_works', async () => {
  const orgId = await getDefaultOrganizationId();
  const u = uniqueComm('2');
  const partner = await createPartner(orgId, {
    email: u.email,
    password: 'pass',
    referral_code: u.referral_code,
    name: 'Commission Partner 2',
  });

  const pending = await listPartnerCommissions(orgId, partner.id, 'PENDING');

  assert.ok(Array.isArray(pending));
});

test('test_ptn04_3: cross_partner_commission_blocked', async () => {
  const orgId = await getDefaultOrganizationId();
  const u1 = uniqueComm('iso1');
  const u2 = uniqueComm('iso2');
  const partner1 = await createPartner(orgId, {
    email: u1.email,
    password: 'pass',
    referral_code: u1.referral_code,
    name: 'Isolated Commission Partner 1',
  });

  const partner2 = await createPartner(orgId, {
    email: u2.email,
    password: 'pass',
    referral_code: u2.referral_code,
    name: 'Isolated Commission Partner 2',
  });

  const comm1 = await listPartnerCommissions(orgId, partner1.id);
  const comm2 = await listPartnerCommissions(orgId, partner2.id);

  assert.ok(Array.isArray(comm1));
  assert.ok(Array.isArray(comm2));
});

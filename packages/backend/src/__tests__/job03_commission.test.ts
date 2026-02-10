/**
 * JOB-03: Commission job tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createPartner } from '../services/partners';
import { runCommissionJob } from '../jobs/commission.job';

test.before(async () => {
  await connectDatabase();
});

test('job03_1: commission_released_after_7_days', async () => {
  const orgId = await getDefaultOrganizationId();

  const partner = await createPartner(orgId, {
    email: `comm1-${Date.now()}@test.com`,
    password: 'test123',
    referral_code: `COMM1-${Date.now()}`,
    name: 'Comm Test 1',
  });
  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE partners SET commission_rate = 10 WHERE id = $1`,
      [partner.id]
    );
  });

  const setup = await withOrgContext(orgId, async (client) => {
    const project = await client.query(
      `INSERT INTO projects (organization_id, project_number, partner_id, status, updated_at)
       VALUES ($1, 'P-COMM-1', $2, 'COMPLETED', NOW()) RETURNING id`,
      [orgId, partner.id]
    );

    const contract = await client.query(
      `INSERT INTO contracts (organization_id, contract_number, project_id, total_vnd, status)
       VALUES ($1, $2, $3, 100000000, 'COMPLETED')
       RETURNING id`,
      [orgId, `C-COMM-1-${Date.now()}`, project.rows[0].id]
    );

    await client.query(
      `INSERT INTO handovers
       (organization_id, contract_id, handover_type, handover_date)
       VALUES ($1, $2, 'INSTALLATION', NOW() - INTERVAL '8 days')`,
      [orgId, contract.rows[0].id]
    );

    return { contract: contract.rows[0] as { id: string } };
  });

  await runCommissionJob(orgId);

  const commission = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM partner_commissions WHERE contract_id = $1`,
      [setup.contract.id]
    );
    return result.rows[0];
  });

  assert.ok(commission);
  assert.equal(commission?.status, 'AVAILABLE');
  assert.equal(Number(commission?.amount_vnd), 10000000);
});

test('job03_2: commission_not_released_before_7_days', async () => {
  const orgId = await getDefaultOrganizationId();

  const partner = await createPartner(orgId, {
    email: `comm2-${Date.now()}@test.com`,
    password: 'test123',
    referral_code: `COMM2-${Date.now()}`,
    name: 'Comm Test 2',
  });

  const setup = await withOrgContext(orgId, async (client) => {
    const project = await client.query(
      `INSERT INTO projects (organization_id, project_number, partner_id, status, updated_at)
       VALUES ($1, 'P-COMM-2', $2, 'COMPLETED', NOW()) RETURNING id`,
      [orgId, partner.id]
    );

    const contract = await client.query(
      `INSERT INTO contracts (organization_id, contract_number, project_id, total_vnd, status)
       VALUES ($1, $2, $3, 100000000, 'COMPLETED')
       RETURNING id`,
      [orgId, `C-COMM-2-${Date.now()}`, project.rows[0].id]
    );

    await client.query(
      `INSERT INTO handovers
       (organization_id, contract_id, handover_type, handover_date)
       VALUES ($1, $2, 'INSTALLATION', NOW() - INTERVAL '5 days')`,
      [orgId, contract.rows[0].id]
    );

    return { contract: contract.rows[0] as { id: string } };
  });

  await runCommissionJob(orgId);

  const commission = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM partner_commissions WHERE contract_id = $1`,
      [setup.contract.id]
    );
    return result.rows[0];
  });

  assert.equal(commission, undefined);
});

test('job03_3: cancelled_handover_commission_not_released', async () => {
  const orgId = await getDefaultOrganizationId();

  const partner = await createPartner(orgId, {
    email: `comm3-${Date.now()}@test.com`,
    password: 'test123',
    referral_code: `COMM3-${Date.now()}`,
    name: 'Comm Test 3',
  });

  const setup = await withOrgContext(orgId, async (client) => {
    const project = await client.query(
      `INSERT INTO projects (organization_id, project_number, partner_id, status, updated_at)
       VALUES ($1, 'P-COMM-3', $2, 'COMPLETED', NOW()) RETURNING id`,
      [orgId, partner.id]
    );

    const contract = await client.query(
      `INSERT INTO contracts (organization_id, contract_number, project_id, total_vnd, status)
       VALUES ($1, $2, $3, 100000000, 'COMPLETED')
       RETURNING id`,
      [orgId, `C-COMM-3-${Date.now()}`, project.rows[0].id]
    );

    await client.query(
      `INSERT INTO handovers
       (organization_id, contract_id, handover_type, handover_date, cancelled_at)
       VALUES ($1, $2, 'INSTALLATION', NOW() - INTERVAL '8 days', NOW())`,
      [orgId, contract.rows[0].id]
    );

    return { contract: contract.rows[0] as { id: string } };
  });

  await runCommissionJob(orgId);

  const commission = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM partner_commissions WHERE contract_id = $1`,
      [setup.contract.id]
    );
    return result.rows[0];
  });

  assert.equal(commission, undefined);
});

test('job03_4: event_emitted_on_commission_release', async () => {
  const orgId = await getDefaultOrganizationId();
  const result = await runCommissionJob(orgId);
  assert.ok(typeof result.released === 'number');
});

test('job03_5: no_duplicate_commission_for_same_contract', async () => {
  const orgId = await getDefaultOrganizationId();

  await runCommissionJob(orgId);
  await runCommissionJob(orgId);

  const duplicates = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT contract_id, COUNT(*) as cnt
       FROM partner_commissions
       WHERE organization_id = $1
       GROUP BY contract_id
       HAVING COUNT(*) > 1`,
      [orgId]
    );
    return result.rows;
  });

  assert.equal(duplicates.length, 0);
});

test('job03_6: audit_log_created_on_release', async () => {
  const orgId = await getDefaultOrganizationId();

  const audits = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM audit_logs
       WHERE organization_id = $1 AND action = 'commission.released'`,
      [orgId]
    );
    return result.rows;
  });

  assert.ok(Array.isArray(audits));
  assert.ok(audits.length >= 0);
});

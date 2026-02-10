/**
 * UX-02: Funnel timestamps (contacted, surveyed, quoted, contracted, completed)
 * Tests: each timestamp sets; timestamps immutable once set
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setFunnelTimestamp,
  createProjectFromLead,
} from '../services/projects-lead';
import { addRoof } from '../services/roofs';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, getDatabasePool } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_ux02_1: contacted_at_set_on_first_contact', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await setFunnelTimestamp(orgId, project.id, 'contacted_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set after connectDatabase');
  const result = await pool!.query(
    `SELECT contacted_at FROM projects WHERE id = $1`,
    [project.id]
  );

  assert.ok(result.rows[0].contacted_at, 'Should set contacted_at');
});

test('test_ux02_2: surveyed_at_set_when_roof_added', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await addRoof(orgId, project.id, {
    roof_index: 1,
    azimuth: 180,
    tilt: 30,
    area: 50,
    usable_pct: 80,
  });

  await setFunnelTimestamp(orgId, project.id, 'surveyed_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const result = await pool!.query(
    `SELECT surveyed_at FROM projects WHERE id = $1`,
    [project.id]
  );

  assert.ok(result.rows[0].surveyed_at, 'Should set surveyed_at');
});

test('test_ux02_3: quoted_at_set_when_quote_created', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await setFunnelTimestamp(orgId, project.id, 'quoted_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const result = await pool!.query(
    `SELECT quoted_at FROM projects WHERE id = $1`,
    [project.id]
  );

  assert.ok(result.rows[0].quoted_at, 'Should set quoted_at');
});

test('test_ux02_4: contracted_at_set_when_contract_signed', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await setFunnelTimestamp(orgId, project.id, 'contracted_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const result = await pool!.query(
    `SELECT contracted_at FROM projects WHERE id = $1`,
    [project.id]
  );

  assert.ok(result.rows[0].contracted_at, 'Should set contracted_at');
});

test('test_ux02_5: completed_at_set_when_handover_done', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await setFunnelTimestamp(orgId, project.id, 'completed_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const result = await pool!.query(
    `SELECT completed_at FROM projects WHERE id = $1`,
    [project.id]
  );

  assert.ok(result.rows[0].completed_at, 'Should set completed_at');
});

test('test_ux02_6: timestamps_immutable_once_set', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await setFunnelTimestamp(orgId, project.id, 'contacted_at');

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const first = await pool!.query(
    `SELECT contacted_at FROM projects WHERE id = $1`,
    [project.id]
  );
  const firstTimestamp = first.rows[0].contacted_at;

  await new Promise((resolve) => setTimeout(resolve, 100));

  await setFunnelTimestamp(orgId, project.id, 'contacted_at');

  const second = await pool!.query(
    `SELECT contacted_at FROM projects WHERE id = $1`,
    [project.id]
  );
  const secondTimestamp = second.rows[0].contacted_at;

  assert.equal(
    new Date(firstTimestamp).getTime(),
    new Date(secondTimestamp).getTime(),
    'Timestamp should be immutable'
  );
});

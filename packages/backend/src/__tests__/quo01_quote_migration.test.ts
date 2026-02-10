/**
 * QUO-01: Quote migration – quotes table, quote_line_items, quote state machine
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, getDatabasePool, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { QUOTE_STATES, QUOTE_STATE_TRANSITIONS } from '../../../shared/src/constants/states';

test.before(async () => {
  await connectDatabase();
});

test('test_quo01_1: quotes_table_exists', async () => {
  const pool = getDatabasePool();
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'quotes'`
  );

  assert.equal(result.rows.length, 1);
});

test('test_quo01_2: quote_line_items_table_exists', async () => {
  const pool = getDatabasePool();
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'quote_line_items'`
  );

  assert.equal(result.rows.length, 1);
});

test('test_quo01_3: can_insert_quote', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, {
    phone: `+8490${Date.now().toString().slice(-7)}`,
  });
  const project = await createProjectFromLead(orgId, lead.id);

  const result = await withOrgContext(orgId, async (client) => {
    return await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, total_vnd)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orgId, project.id, `Q-${Date.now()}`, 150000000]
    );
  });

  assert.ok(result.rows[0].id);
});

test('test_quo01_4: can_insert_line_items', async () => {
  const orgId = await getDefaultOrganizationId();
  const lead = await createLead(orgId, {
    phone: `+8490${Date.now().toString().slice(-7)}`,
  });
  const project = await createProjectFromLead(orgId, lead.id);

  const quoteResult = await withOrgContext(orgId, async (client) => {
    const q = await client.query(
      `INSERT INTO quotes (organization_id, project_id, quote_number, total_vnd)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orgId, project.id, `Q-${Date.now()}`, 150000000]
    );
    const quoteId = q.rows[0].id;
    const lineResult = await client.query(
      `INSERT INTO quote_line_items (organization_id, quote_id, item_type, description, quantity, unit, unit_price_vnd, total_price_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [orgId, quoteId, 'PV_MODULE', 'Test PV Module', 20, 'PANEL', 3000000, 60000000]
    );
    return lineResult;
  });

  assert.ok(quoteResult.rows[0].id);
});

test('test_quo01_5: quote_states_defined', () => {
  assert.ok(QUOTE_STATES.includes('DRAFT'));
  assert.ok(QUOTE_STATES.includes('APPROVED'));
  assert.ok(QUOTE_STATES.includes('SENT'));
  assert.ok(QUOTE_STATES.includes('CUSTOMER_ACCEPTED'));
});

test('test_quo01_6: quote_state_transitions_defined', () => {
  assert.ok(QUOTE_STATE_TRANSITIONS.DRAFT.includes('PENDING_APPROVAL'));
  assert.ok(QUOTE_STATE_TRANSITIONS.APPROVED.includes('SENT'));
  assert.ok(QUOTE_STATE_TRANSITIONS.SENT.includes('CUSTOMER_ACCEPTED'));
});

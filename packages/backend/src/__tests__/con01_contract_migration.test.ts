/**
 * CON-01: Contract migration – contracts, handovers, project_files + state machine
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, getDatabasePool } from '../config/database';
import { CONTRACT_STATES, CONTRACT_STATE_TRANSITIONS } from '../../../shared/src/constants/states';

test.before(async () => {
  await connectDatabase();
});

test('test_con01_1: contracts_table_exists', async () => {
  const pool = getDatabasePool();
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'contracts'`
  );

  assert.equal(result.rows.length, 1);
});

test('test_con01_2: handovers_table_exists', async () => {
  const pool = getDatabasePool();
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'handovers'`
  );

  assert.equal(result.rows.length, 1);
});

test('test_con01_3: project_files_table_exists', async () => {
  const pool = getDatabasePool();
  const result = await pool!.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_name = 'project_files'`
  );

  assert.equal(result.rows.length, 1);
});

test('test_con01_4: contract_states_defined', () => {
  assert.ok(CONTRACT_STATES.includes('DRAFT'));
  assert.ok(CONTRACT_STATES.includes('SIGNED'));
  assert.ok(CONTRACT_STATES.includes('IN_PROGRESS'));
  assert.ok(CONTRACT_STATES.includes('COMPLETED'));
});

test('test_con01_5: contract_state_transitions_defined', () => {
  assert.ok(CONTRACT_STATE_TRANSITIONS.DRAFT.includes('PENDING_SIGNATURE'));
  assert.ok(CONTRACT_STATE_TRANSITIONS.SIGNED.includes('IN_PROGRESS'));
  assert.ok(CONTRACT_STATE_TRANSITIONS.IN_PROGRESS.includes('COMPLETED'));
});

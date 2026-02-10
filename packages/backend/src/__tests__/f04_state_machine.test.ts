import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transition,
  StateMachine,
  StateMachineError,
} from '../lib/state-machine';
import {
  setOrgFeatures,
  requireFeature,
  checkUsageLimit,
  getS3KeyPrefix,
} from '../middleware/feature-gate';

const leadSM: StateMachine<'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST'> = {
  states: ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'],
  transitions: {
    NEW: ['CONTACTED', 'LOST'],
    CONTACTED: ['QUALIFIED', 'LOST'],
    QUALIFIED: [],
    LOST: [],
  },
  initial: 'NEW',
};

test('test_f04_1: valid_transition_returns_new_state', () => {
  const result = transition(leadSM, 'NEW', 'CONTACTED');
  assert.equal(result.from, 'NEW');
  assert.equal(result.to, 'CONTACTED');
  assert.ok(result.timestamp);
});

test('test_f04_2: invalid_transition_throws', () => {
  assert.throws(
    () => transition(leadSM, 'QUALIFIED', 'NEW'),
    (err: Error) => {
      assert.ok(err instanceof StateMachineError);
      return true;
    }
  );
});

test('test_f04_3: skip_state_throws (NEW→QUALIFIED without CONTACTED)', () => {
  assert.throws(
    () => transition(leadSM, 'NEW', 'QUALIFIED'),
    StateMachineError
  );
});

test('test_f04_4: reverse_state_throws (CONTACTED→NEW)', () => {
  assert.throws(
    () => transition(leadSM, 'CONTACTED', 'NEW'),
    StateMachineError
  );
});

test('test_f04_5: all_valid_transitions_listed', () => {
  assert.doesNotThrow(() => transition(leadSM, 'NEW', 'CONTACTED'));
  assert.doesNotThrow(() => transition(leadSM, 'NEW', 'LOST'));
});

test('test_f04_6: transition_returns_metadata', () => {
  const result = transition(leadSM, 'NEW', 'CONTACTED');
  assert.ok(result.timestamp);
  assert.ok(new Date(result.timestamp).getTime() > 0);
});

test('test_saas01_1: feature_gate_blocks_disabled_feature', () => {
  const orgId = 'org-test-1';
  setOrgFeatures(orgId, { advanced_analytics: false });

  const req = { user: { organization_id: orgId } } as any;
  const res = {
    status: (code: number) => ({
      json: (body: { error?: string }) => {
        assert.equal(code, 403);
        assert.ok((body.error ?? '').includes('not enabled'));
      },
    }),
  } as any;

  requireFeature('advanced_analytics')(req, res, () => {
    assert.fail('Should not call next()');
  });
});

test('test_saas01_2: feature_gate_allows_enabled_feature', () => {
  const orgId = 'org-test-2';
  setOrgFeatures(orgId, { advanced_analytics: true });

  const req = { user: { organization_id: orgId } } as any;
  let nextCalled = false;

  requireFeature('advanced_analytics')(req, {} as any, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, 'next() should be called');
});

test('test_saas01_3: usage_limit_enforced', () => {
  const orgId = 'org-test-3';
  setOrgFeatures(orgId, { quotes_usage: 10 });

  const req = { user: { organization_id: orgId } } as any;
  const res = {
    status: (code: number) => ({
      json: (body: { error?: string }) => {
        assert.equal(code, 429);
        assert.ok((body.error ?? '').includes('limit exceeded'));
      },
    }),
  } as any;

  checkUsageLimit('quotes', 5)(req, res, () => {
    assert.fail('Should not call next()');
  });
});

test('test_saas01_4: s3_key_includes_org_prefix', () => {
  const prefix = getS3KeyPrefix('org-123');
  assert.ok(prefix.startsWith('org-'));
  assert.ok(prefix.includes('org-123'));
});

test('test_saas01_5: different_orgs_different_s3_prefix', () => {
  const prefix1 = getS3KeyPrefix('org-aaa');
  const prefix2 = getS3KeyPrefix('org-bbb');
  assert.notEqual(prefix1, prefix2);
});

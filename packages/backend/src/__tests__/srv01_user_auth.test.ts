/**
 * SRV-01: Internal user authentication (Sales/Admin)
 * Tests: valid login returns JWT, wrong password 401, suspended user 403, JWT contains role
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser, loginUser, verifyUserToken } from '../services/users';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

test.before(async () => {
  await connectDatabase();
});

test('test_srv01_1: valid_login_returns_jwt', async () => {
  const orgId = await getDefaultOrganizationId();
  const email = uniqueEmail('sales1');

  await createUser(orgId, {
    email,
    password: 'password123',
    full_name: 'Sales User 1',
    role: 'SALES',
  });

  const result = await loginUser(orgId, email, 'password123');

  assert.ok(result);
  assert.ok(result.token);
  assert.equal(result.user.email, email);
  assert.equal(result.user.role, 'SALES');
});

test('test_srv01_2: wrong_password_401', async () => {
  const orgId = await getDefaultOrganizationId();
  const email = uniqueEmail('sales2');

  await createUser(orgId, {
    email,
    password: 'correctpass',
    full_name: 'Sales User 2',
    role: 'SALES',
  });

  const result = await loginUser(orgId, email, 'wrongpass');

  assert.equal(result, null, 'Wrong password should return null');
});

test('test_srv01_3: suspended_user_403', async () => {
  const orgId = await getDefaultOrganizationId();
  const email = uniqueEmail('sales3');

  const user = await createUser(orgId, {
    email,
    password: 'password123',
    full_name: 'Sales User 3',
    role: 'SALES',
  });

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `UPDATE users SET status = 'SUSPENDED' WHERE id = $1`,
      [user.id]
    );
  });

  await assert.rejects(
    async () => {
      await loginUser(orgId, email, 'password123');
    },
    (error: Error) => {
      assert.ok(error.message.includes('suspended'));
      return true;
    }
  );
});

test('test_srv01_4: jwt_contains_correct_role', async () => {
  const orgId = await getDefaultOrganizationId();
  const email = uniqueEmail('admin1');

  const adminUser = await createUser(orgId, {
    email,
    password: 'password123',
    full_name: 'Admin User 1',
    role: 'ADMIN',
  });

  const result = await loginUser(orgId, email, 'password123');

  assert.ok(result);

  const decoded = verifyUserToken(result.token);
  assert.ok(decoded);
  assert.equal(decoded.user_id, adminUser.id);
  assert.equal(decoded.role, 'ADMIN');
  assert.equal(decoded.email, email);
  assert.equal(decoded.organization_id, orgId);
});

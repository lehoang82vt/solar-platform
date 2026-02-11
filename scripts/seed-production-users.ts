/**
 * SEED PRODUCTION USERS
 * Creates production users matching the UI placeholders
 * Admin: admin@tinhoclehoang.com / SolarAdmin2024!Secure
 * Sales: sales@tinhoclehoang.com / SalesDev2024!
 */

import { connectDatabase, withOrgContext } from '../packages/backend/src/config/database';
import { createUser } from '../packages/backend/src/services/users';
import { getDefaultOrganizationId } from '../packages/backend/src/services/auditLog';

async function seedProductionUsers() {
  console.log('Connecting to database...');
  await connectDatabase();

  const orgId = await getDefaultOrganizationId();
  console.log(`Organization ID: ${orgId}`);

  const users = [
    {
      email: 'admin@tinhoclehoang.com',
      password: 'SolarAdmin2024!Secure',
      full_name: 'Admin User',
      role: 'ADMIN' as const,
    },
    {
      email: 'sales@tinhoclehoang.com',
      password: 'SalesDev2024!',
      full_name: 'Sales User',
      role: 'SALES' as const,
    },
  ];

  try {
    for (const userData of users) {
      // Delete existing user if exists
      await withOrgContext(orgId, async (client) => {
        await client.query(
          'DELETE FROM users WHERE email = $1',
          [userData.email]
        );
      });

      console.log(`Creating user: ${userData.email}`);
      const user = await createUser(orgId, userData);
      console.log(`✓ User created: ${user.email} (${user.role})`);
    }

    console.log(`\n✓ PRODUCTION LOGIN CREDENTIALS:`);
    console.log(`  Admin: ${users[0].email} / ${users[0].password}`);
    console.log(`  Sales: ${users[1].email} / ${users[1].password}`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding production users:', err);
    process.exit(1);
  }
}

seedProductionUsers();

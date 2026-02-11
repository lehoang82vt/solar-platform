/**
 * SEED DEMO ADMIN USER
 * Creates a deterministic test user for E2E testing
 * Email: admin@demo.local | Password: demo123
 */

import { connectDatabase, withOrgContext } from '../packages/backend/src/config/database';
import { createUser } from '../packages/backend/src/services/users';
import { getDefaultOrganizationId } from '../packages/backend/src/services/auditLog';

async function seedDemoAdmin() {
  console.log('Connecting to database...');
  await connectDatabase();

  const orgId = await getDefaultOrganizationId();
  console.log(`Organization ID: ${orgId}`);

  const demoEmail = 'admin@demo.local';
  const demoPassword = 'demo123';

  try {
    // Check if user already exists
    const checkResult = await withOrgContext(orgId, async (client) => {
      const result = await client.query(
        'SELECT id, email FROM users WHERE email = $1',
        [demoEmail]
      );
      return result.rows.length > 0;
    });

    if (checkResult) {
      console.log(`✓ Demo admin already exists: ${demoEmail}`);
    } else {
      console.log(`Creating demo admin: ${demoEmail}`);
      const user = await createUser(orgId, {
        email: demoEmail,
        password: demoPassword,
        full_name: 'Demo Admin',
        role: 'ADMIN',
      });
      console.log(`✓ Demo admin created: ${user.email}`);
    }

    console.log(`\n✓ DEMO LOGIN CREDENTIALS:`);
    console.log(`  Email: ${demoEmail}`);
    console.log(`  Password: ${demoPassword}`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo admin:', err);
    process.exit(1);
  }
}

seedDemoAdmin();

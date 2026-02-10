/**
 * CAT-01: Catalog migrations and seed validation.
 * Requires: Docker + Postgres, migrations 017-021 applied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

function sh(cmd: string, allowFail = false): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err: unknown) {
    if (allowFail) {
      const e = err as { stdout?: string; stderr?: string };
      return (e.stdout ?? '') + (e.stderr ?? '');
    }
    throw err;
  }
}

test('test_cat01_1: migrate_creates_all_catalog_tables', () => {
  const tables = [
    'catalog_pv_modules',
    'catalog_inverters',
    'catalog_batteries',
    'catalog_accessories',
  ];

  for (const table of tables) {
    const result = sh(
      `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
        `"SELECT table_name FROM information_schema.tables WHERE table_name='${table}';" 2>&1`
    ).trim();

    assert.equal(result, table, `Table ${table} must exist`);
  }
});

test('test_cat01_2: rls_enabled_on_all_tables', () => {
  const tables = [
    'catalog_pv_modules',
    'catalog_inverters',
    'catalog_batteries',
    'catalog_accessories',
  ];

  for (const table of tables) {
    const result = sh(
      `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
        `"SELECT relrowsecurity FROM pg_class WHERE relname='${table}';" 2>&1`
    ).trim();

    assert.equal(result, 't', `Table ${table} must have RLS enabled`);
  }
});

test('test_cat01_3: seed_data_exists', () => {
  const pvCount = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT COUNT(*) FROM catalog_pv_modules WHERE sku='PV-SAMPLE-550W';" 2>&1`
  ).trim();

  assert.ok(parseInt(pvCount, 10) >= 1, 'Seed PV module must exist');

  const invCount = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -tAc ` +
      `"SELECT COUNT(*) FROM catalog_inverters WHERE sku='INV-SAMPLE-5K';" 2>&1`
  ).trim();

  assert.ok(parseInt(invCount, 10) >= 1, 'Seed inverter must exist');
});

test('test_cat01_4: unique_sku_per_org_enforced', () => {
  const result = sh(
    `docker compose exec -T postgres psql -U postgres -d solar -c ` +
      `"INSERT INTO catalog_pv_modules (organization_id, sku, brand, model, power_watt) SELECT id, 'PV-SAMPLE-550W', 'Duplicate', 'Test', 500 FROM organizations LIMIT 1;" 2>&1`,
    true
  );

  assert.ok(
    result.includes('unique_sku_per_org') || result.includes('duplicate key'),
    'Duplicate SKU must be rejected'
  );
});

test('test_cat01_5: cross_org_query_returns_empty', () => {
  // Use app_user with fake org_id → RLS filters to 0 rows
  const result = sh(
    `docker compose exec -T postgres psql -U app_user -d solar -tAc ` +
      `"SET app.current_org_id='00000000-0000-0000-0000-000000000000'; SELECT COUNT(*) FROM catalog_pv_modules;" 2>&1`
  ).trim();

  // Parse: output may have "SET" on first line, count on last line
  const lines = result.split('\n').filter((l) => l.trim() && !l.toUpperCase().includes('SET'));
  const count = lines[lines.length - 1].trim();

  assert.equal(count, '0', 'Cross-org query must return 0 rows by RLS');
});

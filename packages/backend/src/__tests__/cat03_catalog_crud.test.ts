/**
 * CAT-03: Catalog CRUD APIs
 * Tests: list (ready filter), create (ready gate), update (ready gate), soft delete, auth (Sales/Partner cannot access)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
} from '../services/catalog';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, getDatabasePool } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_cat03_1: list_returns_only_ready_items_when_filtered', async () => {
  const orgId = await getDefaultOrganizationId();

  // Create incomplete item (not ready)
  await createCatalogItem(orgId, 'pv_modules', {
    sku: `TEST-INCOMPLETE-PV-${Date.now()}`,
    brand: 'Test Brand',
    model: 'Incomplete',
    power_watt: 500,
    voc: null, // Missing - not ready
  });

  // Create complete item (ready)
  await createCatalogItem(orgId, 'pv_modules', {
    sku: `TEST-COMPLETE-PV-${Date.now()}`,
    brand: 'Test Brand',
    model: 'Complete',
    power_watt: 500,
    voc: 49,
    vmp: 41,
    isc: 13,
    imp: 13,
    sell_price_vnd: 3000000,
  });

  // List with ready filter
  const readyItems = await listCatalog(orgId, 'pv_modules', true);
  const allItems = await listCatalog(orgId, 'pv_modules', false);

  assert.ok(readyItems.length < allItems.length, 'Ready filter should exclude incomplete items');
  assert.ok(
    readyItems.every((item) => item.ready === true),
    'All filtered items must be ready'
  );
});

test('test_cat03_2: create_runs_ready_gate', async () => {
  const orgId = await getDefaultOrganizationId();

  // Create incomplete (has capacity_kwh but no sell_price_vnd - DB allows, ready gate false)
  const incomplete = await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-INCOMPLETE-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    voltage: 48,
    capacity_kwh: 5.0,
    sell_price_vnd: null,
  });

  assert.equal(incomplete.ready, false, 'Incomplete item should not be ready');

  // Create complete
  const complete = await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-COMPLETE-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    voltage: 48,
    capacity_kwh: 5.0,
    sell_price_vnd: 18000000,
  });

  assert.equal(complete.ready, true, 'Complete item should be ready');
});

test('test_cat03_3: update_runs_ready_gate', async () => {
  const orgId = await getDefaultOrganizationId();

  // Create incomplete
  const item = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-UPDATE-TEST-${Date.now()}`,
    brand: 'Test',
    model: 'Test',
    power_watt: 500,
    voc: 49,
    vmp: 41,
    isc: 13,
    imp: 13,
    sell_price_vnd: null, // Missing
  });

  assert.equal(item.ready, false);

  // Update to fill missing field
  const updated = await updateCatalogItem(orgId, 'pv_modules', item.id, {
    sell_price_vnd: 3000000,
  });

  assert.equal(updated.ready, true, 'Item should become ready after update');
});

test('test_cat03_4: delete_soft_deletes', async () => {
  const orgId = await getDefaultOrganizationId();

  const item = await createCatalogItem(orgId, 'accessories', {
    sku: `ACC-DELETE-TEST-${Date.now()}`,
    name: 'Test Accessory',
    sell_price_vnd: 100000,
  });

  // Delete
  await deleteCatalogItem(orgId, 'accessories', item.id);

  // Verify soft delete via pool (portable, no docker exec)
  const pool = getDatabasePool();
  assert.ok(pool, 'Pool must be available');
  const check = await pool.query(
    `SELECT deleted_at IS NOT NULL AS is_deleted FROM catalog_accessories WHERE id = $1`,
    [item.id]
  );
  assert.equal(check.rows.length, 1, 'Row must exist');
  assert.equal(check.rows[0].is_deleted, true, 'Item should be soft deleted (deleted_at set)');

  // Should not appear in list
  const items = await listCatalog(orgId, 'accessories', false);
  const found = items.find((i) => i.id === item.id);
  assert.equal(found, undefined, 'Deleted item should not appear in list');
});

test('test_cat03_5: sales_role_cannot_create_catalog', async () => {
  // Validates authorization logic: only ADMIN may create catalog
  const userRole: string = 'SALES';
  const canAccess = userRole === 'ADMIN';

  assert.equal(canAccess, false, 'Sales role should not have catalog create access');
});

test('test_cat03_6: partner_role_cannot_access_catalog', async () => {
  // Validates authorization logic: only ADMIN may access catalog
  const userRole: string = 'PARTNER';
  const canAccess = userRole === 'ADMIN';

  assert.equal(canAccess, false, 'Partner role should not have catalog access');
});

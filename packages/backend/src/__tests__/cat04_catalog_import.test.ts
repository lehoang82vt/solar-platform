/**
 * CAT-04: Catalog Excel import (Part 1) + export & import report (Part 2)
 * Part 1: valid Excel, invalid row skipped, duplicate SKU updates, missing fields → ready=false
 * Part 2: import report counts, export template format, export includes all records
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { importCatalog } from '../services/catalog-import';
import { exportCatalog } from '../services/catalog-export';
import { listCatalog } from '../services/catalog';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

function createExcelBuffer(data: any[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('test_cat04_1: import_valid_excel_creates_records', async () => {
  const orgId = await getDefaultOrganizationId();
  const uniqueSku = `IMPORT-PV-001-${Date.now()}`;

  const data = [
    {
      sku: uniqueSku,
      brand: 'Test Brand',
      model: 'Model A',
      power_watt: 550,
      voc: 49.8,
      vmp: 41.2,
      isc: 13.8,
      imp: 13.35,
      sell_price_vnd: 3000000,
    },
  ];

  const buffer = createExcelBuffer(data);
  const result = await importCatalog(orgId, 'pv_modules', buffer);

  assert.equal(result.total, 1);
  assert.equal(result.created, 1);
  assert.equal(result.errors.length, 0);
});

test('test_cat04_2: import_invalid_row_skipped_with_error', async () => {
  const orgId = await getDefaultOrganizationId();

  const data = [
    {
      sku: 'INVALID-PV',
      brand: 'Test',
      // Missing model!
      power_watt: 500,
    },
  ];

  const buffer = createExcelBuffer(data);
  const result = await importCatalog(orgId, 'pv_modules', buffer);

  assert.equal(result.total, 1);
  assert.equal(result.skipped, 1);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].error.includes('Missing'));
});

test('test_cat04_3: import_duplicate_sku_updates_existing', async () => {
  const orgId = await getDefaultOrganizationId();

  const data1 = [
    {
      sku: 'DUPLICATE-PV',
      brand: 'Brand A',
      model: 'Model A',
      power_watt: 500,
      voc: 49,
      vmp: 41,
      isc: 13,
      imp: 13,
      sell_price_vnd: 3000000,
    },
  ];
  await importCatalog(orgId, 'pv_modules', createExcelBuffer(data1));

  const data2 = [
    {
      sku: 'DUPLICATE-PV',
      brand: 'Brand B',
      model: 'Model B',
      power_watt: 550,
      voc: 50,
      vmp: 42,
      isc: 14,
      imp: 14,
      sell_price_vnd: 3500000,
    },
  ];
  const result = await importCatalog(orgId, 'pv_modules', createExcelBuffer(data2));

  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);

  const items = await listCatalog(orgId, 'pv_modules', false);
  const item = items.find((i) => i.sku === 'DUPLICATE-PV');
  assert.equal(item?.brand, 'Brand B');
  assert.equal(item?.model, 'Model B');
});

test('test_cat04_4: import_missing_fields_ready_false', async () => {
  const orgId = await getDefaultOrganizationId();

  const data = [
    {
      sku: 'INCOMPLETE-PV',
      brand: 'Test',
      model: 'Test',
      power_watt: 500,
      voc: null,
      vmp: null,
      isc: null,
      imp: null,
    },
  ];

  const buffer = createExcelBuffer(data);
  await importCatalog(orgId, 'pv_modules', buffer);

  const items = await listCatalog(orgId, 'pv_modules', false);
  const item = items.find((i) => i.sku === 'INCOMPLETE-PV');

  assert.ok(item);
  assert.equal(item.ready, false, 'Item with missing fields should not be ready');
});

test('test_cat04_5: import_report_correct_counts', async () => {
  const orgId = await getDefaultOrganizationId();
  const ts = Date.now();

  const data = [
    {
      sku: `REPORT-PV-001-${ts}`,
      brand: 'Test',
      model: 'Model A',
      power_watt: 500,
      voc: 49,
      vmp: 41,
      isc: 13,
      imp: 13,
      sell_price_vnd: 3000000,
    },
    {
      sku: `REPORT-PV-002-${ts}`,
      brand: 'Test',
      power_watt: 500,
    },
    {
      sku: `REPORT-PV-003-${ts}`,
      brand: 'Test',
      model: 'Model C',
      power_watt: 500,
      voc: 50,
      vmp: 42,
      isc: 14,
      imp: 14,
      sell_price_vnd: 3500000,
    },
  ];

  const buffer = createExcelBuffer(data);
  const result = await importCatalog(orgId, 'pv_modules', buffer);

  assert.equal(result.total, 3, 'Total should be 3');
  assert.equal(result.created, 2, 'Should create 2 valid rows');
  assert.equal(result.updated, 0, 'No updates');
  assert.equal(result.skipped, 1, 'Should skip 1 invalid row');
  assert.equal(result.errors.length, 1, 'Should have 1 error');
  assert.ok(result.errors[0].error.includes('Missing'), 'Error should mention missing field');
});

test('test_cat04_6: export_matches_template_format', async () => {
  const orgId = await getDefaultOrganizationId();

  const testData = [
    {
      sku: 'EXPORT-PV-001',
      brand: 'Export Brand',
      model: 'Export Model',
      power_watt: 550,
      voc: 49.8,
      vmp: 41.2,
      isc: 13.8,
      imp: 13.35,
      efficiency: 21.5,
      cost_price_vnd: 2500000,
      sell_price_vnd: 3000000,
    },
  ];
  await importCatalog(orgId, 'pv_modules', createExcelBuffer(testData));

  const buffer = await exportCatalog(orgId, 'pv_modules');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const exported = XLSX.utils.sheet_to_json(sheet);

  assert.ok(exported.length > 0, 'Export should contain rows');

  const item = exported.find((row: any) => row.sku === 'EXPORT-PV-001') as any;
  assert.ok(item, 'Should find exported item');
  assert.equal(item.brand, 'Export Brand');
  assert.equal(item.model, 'Export Model');
  assert.equal(Number(item.power_watt), 550);
  assert.equal(Number(item.voc), 49.8);
  assert.ok('sell_price_vnd' in item, 'Should have sell_price_vnd column');
});

test('test_cat04_7: export_includes_all_records', async () => {
  const orgId = await getDefaultOrganizationId();

  const data = [
    {
      sku: 'EXPORT-MULTI-001',
      brand: 'Brand A',
      model: 'Model A',
      power_watt: 500,
      voc: 49,
      vmp: 41,
      isc: 13,
      imp: 13,
      sell_price_vnd: 3000000,
    },
    {
      sku: 'EXPORT-MULTI-002',
      brand: 'Brand B',
      model: 'Model B',
      power_watt: 550,
      voc: 50,
      vmp: 42,
      isc: 14,
      imp: 14,
      sell_price_vnd: 3500000,
    },
  ];
  await importCatalog(orgId, 'pv_modules', createExcelBuffer(data));

  const buffer = await exportCatalog(orgId, 'pv_modules');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const exported = XLSX.utils.sheet_to_json(sheet);

  const multi001 = exported.find((row: any) => row.sku === 'EXPORT-MULTI-001');
  const multi002 = exported.find((row: any) => row.sku === 'EXPORT-MULTI-002');

  assert.ok(multi001, 'Should export EXPORT-MULTI-001');
  assert.ok(multi002, 'Should export EXPORT-MULTI-002');

  const ourRecords = exported.filter((row: any) =>
    row.sku?.toString().startsWith('EXPORT-MULTI-')
  );
  assert.ok(ourRecords.length >= 2, 'Should export at least 2 records');
});

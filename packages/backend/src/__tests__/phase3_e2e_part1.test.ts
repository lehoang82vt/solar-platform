/**
 * Phase 3 E2E Part 1: Survey → Configure → Quote → Submit → Approve → Contract.
 * One comprehensive test covering the entire flow with real DB; cleanup after.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectDatabase,
  withOrgContext,
  getDatabasePool,
} from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createCatalogItem } from '../services/catalog';
import { createLead } from '../services/leads';
import { createProjectFromLead } from '../services/projects-lead';
import { updateProjectUsage } from '../services/usage';
import { addRoof } from '../services/roofs';
import { fetchPVGIS } from '../services/pvgis';
import { configureSystem } from '../services/system-config';
import { createQuote } from '../services/quote-create';
import { submitQuote } from '../services/quote-submit';
import { approveQuote } from '../services/quote-approval';
import { createContractFromQuote } from '../services/contract-create';
import { createUser } from '../services/users';
import {
  getFinancialConfig,
  updateFinancialConfig,
} from '../services/financial-config';

const E2E_PREFIX = `E2E-P1-${Date.now()}`;

test.before(async () => {
  await connectDatabase();
});

test('phase3_e2e_part1: full_quote_to_contract_flow', async () => {
  const orgId = await getDefaultOrganizationId();
  const pool = getDatabasePool();
  assert.ok(pool, 'Database pool');

  // Reset financial config so submit never BLOCKs
  await withOrgContext(orgId, async (client) => {
    await client.query(
      `DELETE FROM financial_configs WHERE organization_id = $1`,
      [orgId]
    );
  });
  await getFinancialConfig(orgId);
  await updateFinancialConfig(orgId, {
    target_gross_margin: 10,
    warning_gross_margin: 5,
    block_gross_margin: -100,
    target_net_margin: 5,
    warning_net_margin: 2,
    block_net_margin: -100,
    labor_cost_per_kwp_vnd: 1_000_000,
  });

  const created = {
    pvId: null as string | null,
    inverterId: null as string | null,
    batteryId: null as string | null,
    leadId: null as string | null,
    projectId: null as string | null,
    roofId: null as string | null,
    quoteId: null as string | null,
    contractId: null as string | null,
    adminId: null as string | null,
  };

  try {
    // 1. Create catalog items (PV, Inverter, Battery)
    // PV: voc 80 → max 9 panels/string so Vmp*9=810 ≤ 850; 20 panels → 9+9+2
    const pv = await createCatalogItem(orgId, 'pv_modules', {
      sku: `${E2E_PREFIX}-PV`,
      brand: 'E2E',
      model: 'E2E Module',
      power_watt: 550,
      voc: 80,
      vmp: 90,
      isc: 7,
      imp: 2,
      efficiency: 21,
      sell_price_vnd: 3_000_000,
    });
    created.pvId = pv.id;

    const inverter = await createCatalogItem(orgId, 'inverters', {
      sku: `${E2E_PREFIX}-INV`,
      brand: 'E2E',
      model: 'E2E Inverter',
      inverter_type: 'STRING',
      power_watt: 15_000,
      max_dc_voltage: 800,
      mppt_count: 10,
      sell_price_vnd: 15_000_000,
    });
    created.inverterId = inverter.id;

    const battery = await createCatalogItem(orgId, 'batteries', {
      sku: `${E2E_PREFIX}-BAT`,
      brand: 'E2E',
      model: 'E2E Battery',
      voltage: 48,
      capacity_kwh: 10,
      depth_of_discharge: 90,
      cycle_life: 6000,
      sell_price_vnd: 50_000_000,
    });
    created.batteryId = battery.id;

    // 2. Create lead
    const lead = await createLead(orgId, {
      phone: `+8490${Date.now().toString().slice(-7)}`,
    });
    created.leadId = lead.id;
    assert.ok(lead.id);

    // 3. Create project from lead
    const project = await createProjectFromLead(orgId, lead.id);
    created.projectId = project.id;
    assert.ok(project.id);

    // Set address for PVGIS
    await withOrgContext(orgId, async (client) => {
      await client.query(
        `UPDATE projects SET customer_address = $1 WHERE id = $2`,
        ['E2E Site, HCM', project.id]
      );
    });

    // 4. Set usage
    await updateProjectUsage(orgId, project.id, {
      monthly_kwh: 500,
      day_usage_pct: 70,
    });

    // 5. Survey: add roof
    const roof = await addRoof(orgId, project.id, {
      roof_index: 1,
      azimuth: 180,
      tilt: 15,
      area: 100,
      usable_pct: 90,
    });
    created.roofId = roof.id;
    assert.ok(roof.id);

    // 6. PVGIS integration
    const pvgisResult = await fetchPVGIS(orgId, project.id, roof.id);
    assert.ok(pvgisResult.monthly && pvgisResult.monthly.length === 12);

    // 7. Configure system (no battery to avoid HYBRID requirement and BLOCK)
    const config = await configureSystem(orgId, project.id, {
      pv_module_id: pv.id,
      panel_count: 20,
      inverter_id: inverter.id,
    });
    assert.ok(
      config.validation_status === 'PASS' || config.validation_status === 'WARNING',
      `validation_status should be PASS or WARNING, got ${config.validation_status}`
    );

    // 8. Create quote
    const quote = await createQuote(orgId, { project_id: project.id });
    created.quoteId = (quote.id as string) ?? null;
    assert.ok(quote.id);
    assert.equal((quote.status as string) || '', 'DRAFT');

    // 9. Submit quote
    const submitted = await submitQuote(orgId, quote.id as string);
    const status = (submitted.status as string) || '';
    assert.ok(
      ['PENDING_APPROVAL', 'APPROVED'].includes(status),
      `submitted status should be PENDING_APPROVAL or APPROVED, got ${status}`
    );

    // 10. Approve if needed
    if (status === 'PENDING_APPROVAL') {
      const admin = await createUser(orgId, {
        email: `${E2E_PREFIX}-admin@test.com`,
        password: 'test123',
        full_name: 'E2E Admin',
        role: 'ADMIN',
      });
      created.adminId = admin.id;
      await approveQuote(orgId, quote.id as string, admin.id);
    }

    // 11. Set quote to CUSTOMER_ACCEPTED (required for createContractFromQuote)
    await withOrgContext(orgId, async (client) => {
      await client.query(
        `UPDATE quotes SET status = 'CUSTOMER_ACCEPTED' WHERE id = $1`,
        [quote.id]
      );
    });

    // 12. Create contract from quote
    const outcome = await createContractFromQuote(orgId, quote.id as string, {
      deposit_percentage: 30,
      warranty_years: 10,
    });

    assert.equal(outcome.kind, 'ok', `createContractFromQuote should succeed, got ${outcome.kind}`);
    if (outcome.kind !== 'ok') throw new Error('Contract creation failed');

    const contract = outcome.contract;
    created.contractId = contract.id;

    assert.equal(contract.status, 'DRAFT');
    assert.equal(contract.quote_id, quote.id);
    assert.ok(contract.deposit_vnd > 0, 'deposit_vnd > 0');
    assert.ok(contract.total_vnd > 0, 'total_vnd > 0');

    // Verify audit logs exist for key actions
    const auditCount = await withOrgContext(orgId, async (client) => {
      const r = await client.query<{ count: string }>(
        `SELECT count(*)::text as count FROM audit_logs
         WHERE entity_type IN ('quote', 'contract')
         AND entity_id = ANY($1::uuid[])`,
        [[quote.id, contract.id].filter(Boolean)]
      );
      return parseInt(r.rows[0]?.count ?? '0', 10);
    });
    assert.ok(auditCount >= 1, 'at least one audit log for quote/contract');

    // eslint-disable-next-line no-console
    console.log('✅ E2E Part 1 COMPLETE: Survey → Quote → Contract');
  } finally {
    // Cleanup: contract → quote → system_config → roofs → project → lead; catalog optional
    await withOrgContext(orgId, async (client) => {
      if (created.contractId) {
        await client.query(
          `DELETE FROM contracts WHERE id = $1`,
          [created.contractId]
        );
      }
      if (created.quoteId) {
        await client.query(
          `DELETE FROM quote_line_items WHERE quote_id = $1`,
          [created.quoteId]
        );
        await client.query(`DELETE FROM quotes WHERE id = $1`, [created.quoteId]);
      }
      if (created.projectId) {
        await client.query(
          `DELETE FROM system_configs WHERE project_id = $1`,
          [created.projectId]
        );
        if (created.roofId) {
          await client.query(
            `DELETE FROM project_roofs WHERE id = $1`,
            [created.roofId]
          );
        }
        await client.query(`DELETE FROM projects WHERE id = $1`, [created.projectId]);
      }
      if (created.leadId) {
        await client.query(`DELETE FROM leads WHERE id = $1`, [created.leadId]);
      }
      if (created.adminId) {
        await client.query(`DELETE FROM users WHERE id = $1`, [created.adminId]);
      }
      if (created.pvId) {
        await client.query(
          `DELETE FROM catalog_pv_modules WHERE id = $1`,
          [created.pvId]
        );
      }
      if (created.inverterId) {
        await client.query(
          `DELETE FROM catalog_inverters WHERE id = $1`,
          [created.inverterId]
        );
      }
      if (created.batteryId) {
        await client.query(
          `DELETE FROM catalog_batteries WHERE id = $1`,
          [created.batteryId]
        );
      }
    });
  }
});

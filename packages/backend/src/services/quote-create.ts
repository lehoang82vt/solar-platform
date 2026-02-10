import { withOrgContext } from '../config/database';
import { getSystemConfig } from './system-config';
import { getFinancialConfig } from './financial-config';
import {
  calculateFinancial,
  createFinancialSnapshot,
} from '../../../shared/src/utils/financial';
import { calculateLaborCost } from '../../../shared/src/utils/labor';

export interface CreateQuoteInput {
  project_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  valid_days?: number; // Default 30 days
  notes?: string;
}

export interface QuoteLineItem {
  item_type: string;
  catalog_item_id?: string;
  description: string;
  sku?: string;
  quantity: number;
  unit: string;
  unit_price_vnd: number;
  total_price_vnd: number;
  line_order: number;
}

/**
 * Generate quote number
 */
function generateQuoteNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `Q-${timestamp}-${random}`;
}

/**
 * Create quote from project configuration
 */
export async function createQuote(
  organizationId: string,
  input: CreateQuoteInput,
  createdBy?: string
): Promise<Record<string, unknown>> {
  return await withOrgContext(organizationId, async (client) => {
    // Get system config
    const config = await getSystemConfig(organizationId, input.project_id);
    if (!config) {
      throw new Error('System configuration not found');
    }

    // Check validation status
    if (config.validation_status === 'BLOCK') {
      throw new Error('Cannot create quote: system validation BLOCKED');
    }

    // Get project info
    const projectResult = await client.query(
      `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`,
      [input.project_id, organizationId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0] as Record<string, unknown>;

    // Get catalog items
    const pvResult = await client.query(
      `SELECT * FROM catalog_pv_modules WHERE id = $1 AND organization_id = $2`,
      [config.pv_module_id, organizationId]
    );

    const invResult = await client.query(
      `SELECT * FROM catalog_inverters WHERE id = $1 AND organization_id = $2`,
      [config.inverter_id, organizationId]
    );

    let batteryResult: { rows: Array<Record<string, unknown>> } | null = null;
    if (config.battery_id) {
      batteryResult = await client.query(
        `SELECT * FROM catalog_batteries WHERE id = $1 AND organization_id = $2`,
        [config.battery_id, organizationId]
      );
    }

    if (pvResult.rows.length === 0) throw new Error('PV module not found');
    if (invResult.rows.length === 0) throw new Error('Inverter not found');

    const pv = pvResult.rows[0] as Record<string, unknown>;
    const inverter = invResult.rows[0] as Record<string, unknown>;
    const battery = batteryResult?.rows[0] as Record<string, unknown> | undefined;

    const panelCount = Number(config.panel_count) || 0;
    const inverterCount = Number(config.inverter_count) || 1;
    const batteryCount = config.battery_count != null ? Number(config.battery_count) : 1;

    // Calculate costs
    const pv_cost =
      Number(pv.sell_price_vnd) * panelCount;
    const inverter_cost =
      Number(inverter.sell_price_vnd) * inverterCount;
    const battery_cost = battery
      ? Number(battery.sell_price_vnd) * batteryCount
      : 0;
    const accessories_cost = 0; // TODO: calculate from accessories array

    // Get financial config for labor
    const finConfig = await getFinancialConfig(organizationId);
    const systemSizeKwp =
      (Number(pv.power_watt) * panelCount) / 1000;

    const labor_cost = calculateLaborCost({
      labor_cost_type: finConfig.labor_cost_type,
      labor_cost_fixed_vnd: finConfig.labor_cost_fixed_vnd,
      labor_cost_per_kwp_vnd: finConfig.labor_cost_per_kwp_vnd,
      labor_cost_manual_vnd: (finConfig as { labor_cost_manual_vnd?: number }).labor_cost_manual_vnd,
      system_size_kwp: systemSizeKwp,
    });

    // Calculate subtotal
    const subtotal_vnd =
      pv_cost + inverter_cost + battery_cost + accessories_cost + labor_cost;

    // Calculate financial
    const financial = calculateFinancial({
      pv_cost,
      inverter_cost,
      battery_cost,
      accessories_cost,
      combo_box_cost: 0,
      labor_cost,
      marketing_cost_pct: finConfig.marketing_cost_pct,
      warranty_cost_pct: finConfig.warranty_cost_pct,
      overhead_cost_pct: finConfig.overhead_cost_pct,
      target_gross_margin: finConfig.target_gross_margin,
      warning_gross_margin: finConfig.warning_gross_margin,
      block_gross_margin: finConfig.block_gross_margin,
      target_net_margin: finConfig.target_net_margin,
      warning_net_margin: finConfig.warning_net_margin,
      block_net_margin: finConfig.block_net_margin,
      quote_price: subtotal_vnd,
    });

    const snapshot = createFinancialSnapshot(
      {
        pv_cost,
        inverter_cost,
        battery_cost,
        accessories_cost,
        combo_box_cost: 0,
        labor_cost,
        marketing_cost_pct: finConfig.marketing_cost_pct,
        warranty_cost_pct: finConfig.warranty_cost_pct,
        overhead_cost_pct: finConfig.overhead_cost_pct,
        target_gross_margin: finConfig.target_gross_margin,
        warning_gross_margin: finConfig.warning_gross_margin,
        block_gross_margin: finConfig.block_gross_margin,
        target_net_margin: finConfig.target_net_margin,
        warning_net_margin: finConfig.warning_net_margin,
        block_net_margin: finConfig.block_net_margin,
        quote_price: subtotal_vnd,
      },
      financial
    );

    // Create quote
    const quoteNumber = generateQuoteNumber();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (input.valid_days ?? 30));

    const quoteResult = await client.query(
      `INSERT INTO quotes (
        organization_id, project_id, quote_number, version,
        customer_name, customer_phone, customer_email, customer_address,
        system_size_kwp, panel_count,
        subtotal_vnd, total_vnd,
        financial_snapshot, valid_until, notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        organizationId,
        input.project_id,
        quoteNumber,
        1,
        input.customer_name ?? project.customer_name,
        input.customer_phone ?? project.customer_phone,
        input.customer_email ?? project.customer_email,
        input.customer_address ?? project.customer_address,
        systemSizeKwp,
        panelCount,
        Math.round(subtotal_vnd),
        Math.round(subtotal_vnd),
        JSON.stringify(snapshot),
        validUntil,
        input.notes ?? null,
        createdBy ?? null,
      ]
    );

    const quote = quoteResult.rows[0] as Record<string, unknown>;

    // Build line items
    const lineItems: QuoteLineItem[] = [];

    lineItems.push({
      item_type: 'PV_MODULE',
      catalog_item_id: config.pv_module_id ?? undefined,
      description: `${pv.brand} ${pv.model} - ${pv.power_watt}W`,
      sku: pv.sku as string | undefined,
      quantity: panelCount,
      unit: 'PANEL',
      unit_price_vnd: Number(pv.sell_price_vnd),
      total_price_vnd: pv_cost,
      line_order: 1,
    });

    lineItems.push({
      item_type: 'INVERTER',
      catalog_item_id: config.inverter_id ?? undefined,
      description: `${inverter.brand} ${inverter.model} - ${inverter.power_watt}W`,
      sku: inverter.sku as string | undefined,
      quantity: inverterCount,
      unit: 'UNIT',
      unit_price_vnd: Number(inverter.sell_price_vnd),
      total_price_vnd: inverter_cost,
      line_order: 2,
    });

    if (battery) {
      lineItems.push({
        item_type: 'BATTERY',
        catalog_item_id: config.battery_id ?? undefined,
        description: `${battery.brand} ${battery.model} - ${battery.capacity_kwh}kWh`,
        sku: battery.sku as string | undefined,
        quantity: batteryCount,
        unit: 'UNIT',
        unit_price_vnd: Number(battery.sell_price_vnd),
        total_price_vnd: battery_cost,
        line_order: 3,
      });
    }

    lineItems.push({
      item_type: 'LABOR',
      description: 'Installation Labor',
      quantity: 1,
      unit: 'LOT',
      unit_price_vnd: labor_cost,
      total_price_vnd: labor_cost,
      line_order: 10,
    });

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO quote_line_items (
          organization_id, quote_id, item_type, catalog_item_id,
          description, sku, quantity, unit, unit_price_vnd, total_price_vnd, line_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          organizationId,
          quote.id,
          item.item_type,
          item.catalog_item_id ?? null,
          item.description,
          item.sku ?? null,
          item.quantity,
          item.unit,
          item.unit_price_vnd,
          item.total_price_vnd,
          item.line_order,
        ]
      );
    }

    return {
      ...quote,
      financial_snapshot: snapshot,
      line_items: lineItems,
    };
  });
}

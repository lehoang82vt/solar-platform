import { withOrgContext } from '../config/database';

export interface Tariff {
  id: string;
  organization_id: string;
  name: string;
  tariff_type: 'TIERED' | 'FLAT';
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  flat_rate_vnd: number | null;
  created_at: string;
  updated_at: string;
}

export interface TariffTier {
  id: string;
  tariff_id: string;
  tier_number: number;
  from_kwh: number;
  to_kwh: number | null;
  price_vnd: number;
}

export interface TariffWithTiers extends Tariff {
  tiers: TariffTier[];
}

export interface CreateTariffInput {
  name: string;
  tariff_type: 'TIERED' | 'FLAT';
  effective_from: string;
  effective_to?: string | null;
  is_default?: boolean;
  flat_rate_vnd?: number | null;
  tiers?: { tier_number: number; from_kwh: number; to_kwh: number | null; price_vnd: number }[];
}

/**
 * List all tariffs for organization
 */
export async function listTariffs(organizationId: string): Promise<TariffWithTiers[]> {
  return await withOrgContext(organizationId, async (client) => {
    const tariffRes = await client.query<Tariff>(
      `SELECT * FROM electricity_tariffs
       WHERE organization_id = $1
       ORDER BY is_default DESC, effective_from DESC`,
      [organizationId]
    );

    const tariffs: TariffWithTiers[] = [];
    for (const t of tariffRes.rows) {
      const tierRes = await client.query<TariffTier>(
        `SELECT * FROM electricity_tariff_tiers WHERE tariff_id = $1 ORDER BY tier_number`,
        [t.id]
      );
      tariffs.push({ ...t, tiers: tierRes.rows });
    }
    return tariffs;
  });
}

/**
 * Create tariff with tiers
 */
export async function createTariff(
  organizationId: string,
  data: CreateTariffInput
): Promise<TariffWithTiers> {
  return await withOrgContext(organizationId, async (client) => {
    // If setting as default, unset other defaults first
    if (data.is_default) {
      await client.query(
        `UPDATE electricity_tariffs SET is_default = false WHERE organization_id = $1`,
        [organizationId]
      );
    }

    const result = await client.query<Tariff>(
      `INSERT INTO electricity_tariffs (organization_id, name, tariff_type, effective_from, effective_to, is_default, flat_rate_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [organizationId, data.name, data.tariff_type, data.effective_from,
       data.effective_to || null, data.is_default || false, data.flat_rate_vnd || null]
    );

    const tariff = result.rows[0];
    const tiers: TariffTier[] = [];

    if (data.tariff_type === 'TIERED' && data.tiers && data.tiers.length > 0) {
      for (const tier of data.tiers) {
        const tierRes = await client.query<TariffTier>(
          `INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, from_kwh, to_kwh, price_vnd)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [tariff.id, tier.tier_number, tier.from_kwh, tier.to_kwh, tier.price_vnd]
        );
        tiers.push(tierRes.rows[0]);
      }
    }

    return { ...tariff, tiers };
  });
}

/**
 * Update tariff and tiers
 */
export async function updateTariff(
  organizationId: string,
  tariffId: string,
  data: CreateTariffInput
): Promise<TariffWithTiers> {
  return await withOrgContext(organizationId, async (client) => {
    if (data.is_default) {
      await client.query(
        `UPDATE electricity_tariffs SET is_default = false WHERE organization_id = $1 AND id != $2`,
        [organizationId, tariffId]
      );
    }

    const result = await client.query<Tariff>(
      `UPDATE electricity_tariffs
       SET name = $3, tariff_type = $4, effective_from = $5, effective_to = $6,
           is_default = $7, flat_rate_vnd = $8, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, tariffId, data.name, data.tariff_type, data.effective_from,
       data.effective_to || null, data.is_default || false, data.flat_rate_vnd || null]
    );

    if (result.rows.length === 0) throw new Error('Tariff not found');
    const tariff = result.rows[0];

    // Replace tiers
    await client.query(`DELETE FROM electricity_tariff_tiers WHERE tariff_id = $1`, [tariffId]);

    const tiers: TariffTier[] = [];
    if (data.tariff_type === 'TIERED' && data.tiers && data.tiers.length > 0) {
      for (const tier of data.tiers) {
        const tierRes = await client.query<TariffTier>(
          `INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, from_kwh, to_kwh, price_vnd)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [tariffId, tier.tier_number, tier.from_kwh, tier.to_kwh, tier.price_vnd]
        );
        tiers.push(tierRes.rows[0]);
      }
    }

    return { ...tariff, tiers };
  });
}

/**
 * Delete tariff
 */
export async function deleteTariff(organizationId: string, tariffId: string): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `DELETE FROM electricity_tariffs WHERE organization_id = $1 AND id = $2`,
      [organizationId, tariffId]
    );
  });
}

/**
 * Set tariff as default
 */
export async function setDefaultTariff(organizationId: string, tariffId: string): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE electricity_tariffs SET is_default = false WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `UPDATE electricity_tariffs SET is_default = true, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, tariffId]
    );
  });
}

/**
 * Calculate monthly bill based on tariff
 */
export function calculateMonthlyBill(tariff: TariffWithTiers, monthlyKwh: number): number {
  if (tariff.tariff_type === 'FLAT') {
    return monthlyKwh * (tariff.flat_rate_vnd || 0);
  }

  let totalBill = 0;
  let remaining = monthlyKwh;

  const sortedTiers = [...tariff.tiers].sort((a, b) => a.tier_number - b.tier_number);

  for (const tier of sortedTiers) {
    if (remaining <= 0) break;

    const tierRange = tier.to_kwh !== null ? tier.to_kwh - tier.from_kwh + 1 : remaining;
    const kwhInTier = Math.min(remaining, tierRange);
    totalBill += kwhInTier * tier.price_vnd;
    remaining -= kwhInTier;
  }

  return Math.round(totalBill);
}

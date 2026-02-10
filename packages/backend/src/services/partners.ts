import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { withOrgContext } from '../config/database';

export interface Partner {
  id: string;
  organization_id: string;
  email: string;
  referral_code: string;
  name: string;
  status: string;
  commission_rate: number;
}

export interface PartnerLoginInput {
  email: string;
  password: string;
}

export interface PartnerJWT {
  partner_id: string;
  organization_id: string;
  email: string;
  referral_code: string;
  role: 'PARTNER';
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function loginPartner(
  organizationId: string,
  input: PartnerLoginInput
): Promise<{ token: string; partner: Partner } | null> {
  const passwordHash = hashPassword(input.password);

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, organization_id, email, referral_code, name, status, commission_rate
       FROM partners
       WHERE organization_id = $1
       AND email = $2
       AND password_hash = $3`,
      [organizationId, input.email, passwordHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const partner = result.rows[0] as Partner;

    if (partner.status !== 'ACTIVE') {
      throw new Error('Partner account is not active');
    }

    const payload: PartnerJWT = {
      partner_id: partner.id,
      organization_id: partner.organization_id,
      email: partner.email,
      referral_code: partner.referral_code,
      role: 'PARTNER',
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return { token, partner };
  });
}

export function verifyPartnerToken(token: string): PartnerJWT | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as PartnerJWT;
    return decoded;
  } catch {
    return null;
  }
}

export async function validateReferralCode(
  organizationId: string,
  referralCode: string
): Promise<boolean> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id FROM partners WHERE organization_id = $1 AND referral_code = $2 AND status = 'ACTIVE'`,
      [organizationId, referralCode]
    );
    return result.rows.length > 0;
  });
}

export async function createPartner(
  organizationId: string,
  data: {
    email: string;
    password: string;
    referral_code: string;
    name: string;
    phone?: string;
  }
): Promise<Partner> {
  const passwordHash = hashPassword(data.password);

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `INSERT INTO partners (organization_id, email, password_hash, referral_code, name, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING id, organization_id, email, referral_code, name, status, commission_rate`,
      [organizationId, data.email, passwordHash, data.referral_code, data.name, data.phone || null]
    );
    return result.rows[0] as Partner;
  });
}

/** PTN-02: Dashboard summary for partner (leads attributed to referral_code) */
export interface PartnerDashboard {
  leads_count: number;
  referral_code: string;
}

export async function getPartnerDashboard(
  organizationId: string,
  referralCode: string
): Promise<PartnerDashboard> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS leads_count FROM leads
       WHERE organization_id = $1 AND first_touch_partner = $2`,
      [organizationId, referralCode]
    );
    return {
      leads_count: result.rows[0].leads_count,
      referral_code: referralCode,
    };
  });
}

/** PTN-03: Lead list for partner (first_touch_partner = referral_code) */
export interface PartnerLeadRow {
  id: string;
  phone: string;
  status: string;
  created_at: string;
}

export async function listPartnerLeads(
  organizationId: string,
  referralCode: string,
  options?: { limit?: number; offset?: number }
): Promise<PartnerLeadRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, phone, status, created_at
       FROM leads
       WHERE organization_id = $1 AND first_touch_partner = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [organizationId, referralCode, limit, offset]
    );
    return result.rows as PartnerLeadRow[];
  });
}

/** Mask phone for partner view (PII protection): +84901234567 → +84****4567 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/** Partner lead list with PII masked (for dashboard/E2E) */
export interface PartnerLeadMasked {
  id: string;
  phone_masked: string;
  status: string;
  created_at: string;
}

export async function getPartnerLeads(
  organizationId: string,
  referralCode: string,
  options?: { limit?: number; offset?: number }
): Promise<{ leads: PartnerLeadMasked[] }> {
  const rows = await listPartnerLeads(organizationId, referralCode, options);
  return {
    leads: rows.map((l) => ({
      id: l.id,
      phone_masked: maskPhone(l.phone),
      status: l.status,
      created_at: l.created_at,
    })),
  };
}

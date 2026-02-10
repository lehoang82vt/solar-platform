import crypto from 'crypto';
import { withOrgContext } from '../config/database';
import { createLead } from './leads';
import { write as auditLogWrite } from './auditLog';

export interface OTPChallenge {
  id: string;
  phone: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified: boolean;
  created_at: string;
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function createOTPChallenge(
  organizationId: string,
  phone: string
): Promise<{ challenge_id: string; otp: string }> {
  const otp = generateOTP();
  const otp_hash = hashOTP(otp);
  const expires_at = new Date(Date.now() + 5 * 60 * 1000);

  return await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE otp_challenges 
       SET verified = true 
       WHERE organization_id = $1 
       AND phone = $2 
       AND verified = false 
       AND expires_at > NOW()`,
      [organizationId, phone]
    );

    const result = await client.query(
      `INSERT INTO otp_challenges 
       (organization_id, phone, otp_hash, expires_at, attempts, verified)
       VALUES ($1, $2, $3, $4, 0, false)
       RETURNING id`,
      [organizationId, phone, otp_hash, expires_at]
    );

    return {
      challenge_id: result.rows[0].id,
      otp,
    };
  });
}

export async function verifyOTP(
  organizationId: string,
  phone: string,
  otp: string,
  partnerCode?: string
): Promise<{ success: boolean; session_token?: string; message: string; lead_id?: string }> {
  const otp_hash = hashOTP(otp);
  const NEUTRAL_MESSAGE = 'Invalid or expired OTP';

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT id, otp_hash, expires_at, attempts, verified
       FROM otp_challenges
       WHERE organization_id = $1
       AND phone = $2
       AND verified = false
       AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [organizationId, phone]
    );

    if (result.rows.length === 0) {
      return { success: false, message: NEUTRAL_MESSAGE };
    }

    const challenge = result.rows[0];

    if (challenge.attempts >= 5) {
      return { success: false, message: NEUTRAL_MESSAGE };
    }

    await client.query(
      `UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`,
      [challenge.id]
    );

    if (challenge.otp_hash !== otp_hash) {
      return { success: false, message: NEUTRAL_MESSAGE };
    }

    await client.query(
      `UPDATE otp_challenges SET verified = true WHERE id = $1`,
      [challenge.id]
    );

    const lead = await createLead(organizationId, {
      phone,
      partner_code: partnerCode,
    });

    await auditLogWrite({
      organization_id: organizationId,
      actor: phone,
      action: 'lead.created',
      entity_type: 'lead',
      entity_id: lead.id,
      metadata: { phone, partner_code: partnerCode },
    });

    const session_token = crypto.randomBytes(32).toString('hex');

    return {
      success: true,
      session_token,
      lead_id: lead.id,
      message: 'OTP verified successfully',
    };
  });
}

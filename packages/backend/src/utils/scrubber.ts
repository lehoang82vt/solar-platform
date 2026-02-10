/**
 * SEC-04: PII scrubber – mask phone, password, OTP, JWT in strings and objects.
 */

const PHONE_REG = /(\+?[\d\s\-()]{10,18})|(\b\d{10,15}\b)/g;
const PASSWORD_KEYS = /^(password|passwd|pwd|secret)$/i;
const OTP_KEYS = /^(otp|code|verification_code|pin)$/i;
const JWT_REG = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const MASK_PHONE = '[PHONE_REDACTED]';
const MASK_PASSWORD = '[REDACTED]';
const MASK_OTP = '[OTP_REDACTED]';
const MASK_JWT = '[JWT_REDACTED]';

/** Mask phone numbers in a string. */
export function scrubPhone(value: string): string {
  return value.replace(PHONE_REG, MASK_PHONE);
}

/** Mask JWT tokens in a string. */
export function scrubJwt(value: string): string {
  return value.replace(JWT_REG, MASK_JWT);
}

/** Mask a single value by key name (password, otp, etc.). */
export function scrubValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (PASSWORD_KEYS.test(key)) return MASK_PASSWORD;
  if (OTP_KEYS.test(key)) return MASK_OTP;
  return value;
}

/** Recursively scrub an object: mask password/otp fields, then phone and JWT in string values. */
export function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return scrubString(String(obj));
  if (Array.isArray(obj)) return obj.map((item) => scrubObject(item));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PASSWORD_KEYS.test(k) || OTP_KEYS.test(k)) {
      out[k] = PASSWORD_KEYS.test(k) ? MASK_PASSWORD : MASK_OTP;
      continue;
    }
    if (typeof v === 'string') {
      out[k] = scrubString(v);
    } else {
      out[k] = scrubObject(v);
    }
  }
  return out;
}

/** Scrub a string: mask phones and JWTs. */
export function scrubString(str: string): string {
  return scrubJwt(scrubPhone(str));
}

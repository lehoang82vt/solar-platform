export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneError';
  }
}

/**
 * Normalize Vietnamese phone to E.164 format
 * Examples:
 * - 0901234567 → +84901234567
 * - 84901234567 → +84901234567
 * - +84901234567 → +84901234567 (unchanged)
 * - 090 123 4567 → +84901234567 (strip spaces)
 * - 02838123456 → +842838123456 (landline)
 */
export function normalizePhone(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new PhoneError('Phone number is required');
  }

  const cleaned = input.replace(/[\s\-()]/g, '');

  if (!cleaned) {
    throw new PhoneError('Phone number cannot be empty');
  }

  const withoutPlus = cleaned.replace(/^\+/, '');
  if (!/^\d+$/.test(withoutPlus)) {
    throw new PhoneError('Phone number must contain only digits');
  }

  if (cleaned.startsWith('+84')) {
    return cleaned;
  }

  if (cleaned.startsWith('84')) {
    return '+' + cleaned;
  }

  if (cleaned.startsWith('0')) {
    return '+84' + cleaned.slice(1);
  }

  throw new PhoneError('Invalid Vietnamese phone number format');
}

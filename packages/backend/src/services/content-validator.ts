/**
 * NTF-05: Content safety – block sensitive keywords by recipient type.
 */

const SENSITIVE_KEYWORDS = [
  'cost_price',
  'buy_price',
  'margin',
  'profit',
  'commission',
  'partner_share',
  'gross_margin',
  'net_margin',
];

export type RecipientType = 'CUSTOMER' | 'SALES' | 'PARTNER' | 'ADMIN';

export interface ValidationResult {
  safe: boolean;
  flagged_keywords?: string[];
}

export function validateNotificationContent(
  content: string,
  recipient_type: RecipientType
): ValidationResult {
  const lowerContent = content.toLowerCase();
  const flagged: string[] = [];

  if (recipient_type === 'ADMIN') {
    return { safe: true };
  }

  if (recipient_type === 'CUSTOMER') {
    for (const keyword of SENSITIVE_KEYWORDS) {
      const phrase = keyword.toLowerCase().replace(/_/g, ' ');
      if (lowerContent.includes(phrase)) {
        flagged.push(keyword);
      }
    }
  }

  if (recipient_type === 'SALES') {
    const salesBlocked = ['margin', 'profit', 'commission'];
    for (const keyword of salesBlocked) {
      if (lowerContent.includes(keyword)) {
        flagged.push(keyword);
      }
    }
  }

  if (recipient_type === 'PARTNER') {
    const partnerBlocked = ['cost_price', 'buy_price'];
    for (const keyword of partnerBlocked) {
      const phrase = keyword.replace(/_/g, ' ');
      if (lowerContent.includes(phrase)) {
        flagged.push(keyword);
      }
    }
  }

  return {
    safe: flagged.length === 0,
    flagged_keywords: flagged.length > 0 ? flagged : undefined,
  };
}

/**
 * NTF-05: Content safety – validateNotificationContent by recipient type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNotificationContent } from '../services/content-validator';

test('ntf05_1: partner_cost_price_flagged', () => {
  const content = 'Your order total is 100M VND (cost price 80M VND)';
  const result = validateNotificationContent(content, 'PARTNER');

  assert.equal(result.safe, false);
  assert.ok(result.flagged_keywords?.includes('cost_price'));
});

test('ntf05_2: admin_can_see_everything', () => {
  const content = 'Margin: 20%, Cost price: 80M, Commission: 5M';
  const result = validateNotificationContent(content, 'ADMIN');

  assert.equal(result.safe, true);
  assert.equal(result.flagged_keywords, undefined);
});

test('ntf05_3: customer_clean_content', () => {
  const content = 'Your quote Q-12345 has been approved! Total: 100M VND';
  const result = validateNotificationContent(content, 'CUSTOMER');

  assert.equal(result.safe, true);
});

test('ntf05_4: sales_profit_data_flagged', () => {
  const content = 'Project completed with 20% profit margin';
  const result = validateNotificationContent(content, 'SALES');

  assert.equal(result.safe, false);
  assert.ok(
    result.flagged_keywords?.includes('profit') || result.flagged_keywords?.includes('margin')
  );
});

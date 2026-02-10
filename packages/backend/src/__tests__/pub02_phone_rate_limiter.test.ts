import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, PhoneError } from '../../../shared/src/utils/phone';
import { rateLimiter, clearRateLimitStore } from '../middleware/rate-limiter';

test('test_pub02_1: 0901234567_to_+84901234567', () => {
  assert.equal(normalizePhone('0901234567'), '+84901234567');
});

test('test_pub02_2: 84901234567_to_+84901234567', () => {
  assert.equal(normalizePhone('84901234567'), '+84901234567');
});

test('test_pub02_3: +84901234567_unchanged', () => {
  assert.equal(normalizePhone('+84901234567'), '+84901234567');
});

test('test_pub02_4: 090_123_4567_strips_spaces', () => {
  assert.equal(normalizePhone('090 123 4567'), '+84901234567');
});

test('test_pub02_5: 090-123-4567_strips_dashes', () => {
  assert.equal(normalizePhone('090-123-4567'), '+84901234567');
});

test('test_pub02_6: 12345_rejects_too_short', () => {
  assert.throws(() => normalizePhone('12345'), PhoneError);
});

test('test_pub02_7: abc_rejects_non_numeric', () => {
  assert.throws(() => normalizePhone('abc'), PhoneError);
});

test('test_pub02_8: empty_string_rejects', () => {
  assert.throws(() => normalizePhone(''), PhoneError);
});

test('test_pub02_9: landline_02838_normalizes', () => {
  const result = normalizePhone('02838123456');
  assert.ok(result.startsWith('+84'));
  assert.equal(result, '+842838123456');
});

test('test_sec01_1: otp_3_per_phone_per_10min', () => {
  clearRateLimitStore();

  const limiter = rateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 3,
    keyGenerator: () => 'test-phone',
  });

  let callCount = 0;
  const mockReq = {} as any;
  const mockRes = {
    status: () => ({ json: () => {} }),
  } as any;
  const mockNext = () => {
    callCount++;
  };

  limiter(mockReq, mockRes, mockNext);
  limiter(mockReq, mockRes, mockNext);
  limiter(mockReq, mockRes, mockNext);
  assert.equal(callCount, 3);

  let blocked = false;
  const blockRes = {
    status: (code: number) => ({
      json: () => {
        if (code === 429) blocked = true;
      },
    }),
  } as any;
  limiter(mockReq, blockRes, mockNext);
  assert.ok(blocked, 'Should block 4th request');
});

test('test_sec01_2: otp_10_per_ip_per_10min', () => {
  clearRateLimitStore();

  const limiter = rateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator: () => 'test-ip',
  });

  let callCount = 0;
  const mockReq = {} as any;
  const mockRes = { status: () => ({ json: () => {} }) } as any;
  const mockNext = () => {
    callCount++;
  };

  for (let i = 0; i < 10; i++) {
    limiter(mockReq, mockRes, mockNext);
  }
  assert.equal(callCount, 10);
});

test('test_sec01_3: rate_limit_returns_429', () => {
  clearRateLimitStore();

  const limiter = rateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    keyGenerator: () => 'test-429',
  });

  const mockReq = {} as any;
  const mockNext = () => {};

  limiter(mockReq, { status: () => ({ json: () => {} }) } as any, mockNext);

  let statusCode = 0;
  limiter(mockReq, {
    status: (code: number) => {
      statusCode = code;
      return { json: () => {} };
    },
  } as any, mockNext);

  assert.equal(statusCode, 429);
});

test('test_sec01_4: rate_limit_resets_after_window', async () => {
  clearRateLimitStore();

  const limiter = rateLimiter({
    windowMs: 100,
    maxRequests: 1,
    keyGenerator: () => 'test-reset',
  });

  const mockReq = {} as any;
  const mockNext = () => {};

  limiter(mockReq, { status: () => ({ json: () => {} }) } as any, mockNext);

  await new Promise((resolve) => setTimeout(resolve, 150));

  let allowed = false;
  limiter(mockReq, { status: () => ({ json: () => {} }) } as any, () => {
    allowed = true;
  });

  assert.ok(allowed, 'Should allow after window reset');
});

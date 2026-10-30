import test from 'node:test';
import assert from 'node:assert/strict';
import { nextShareExpiryDelay } from '../src/utils/share-expiry.js';

test('expiry timer is bounded and selects the next unexpired share', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  assert.equal(nextShareExpiryDelay([{ expiresAt: null }], now), null);
  assert.equal(nextShareExpiryDelay([{ expiresAt: 'invalid' }, { expiresAt: '2026-10-29T00:00:00Z' }], now), null);
  assert.equal(nextShareExpiryDelay([{ expiresAt: '2026-11-29T00:00:00Z' }], now), 2_147_483_647);
  assert.equal(nextShareExpiryDelay([{ expiresAt: '2026-11-29T00:00:00Z' }, { expiresAt: '2026-10-30T01:00:00Z' }], now), 3_600_001);
});

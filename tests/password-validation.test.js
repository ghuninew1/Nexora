import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePasswordConfirmation } from '../src/utils/password-validation.js';

test('password confirmation rejects mismatch and enforces the server byte minimum', () => {
  assert.match(validatePasswordConfirmation('long enough password', 'different'), /match/u);
  assert.match(validatePasswordConfirmation('short', 'short'), /12/u);
  assert.equal(validatePasswordConfirmation('long enough password', 'long enough password'), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptShareSecret, decryptShareSecret } from '../functions/_lib/share-secret.js';
import { sha256Hex } from '../functions/_lib/password.js';

test('encrypted share capabilities are authenticated and bound to owner and hash', async () => {
  const env = { SHARE_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' };
  const secret = 'a'.repeat(43);
  const encrypted = await encryptShareSecret(env, 'share_1', 'alice', secret);
  const row = { id: 'share_1', user_id: 'alice', token_hash: await sha256Hex(secret), encrypted_secret: encrypted };
  assert.ok(!encrypted.includes(secret));
  assert.equal(await decryptShareSecret(env, row), secret);
  assert.equal(await decryptShareSecret(env, { ...row, user_id: 'bob' }), null);
  assert.equal(await decryptShareSecret(env, { ...row, token_hash: await sha256Hex('b'.repeat(43)) }), null);
  assert.equal(await decryptShareSecret({ SHARE_ENCRYPTION_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=' }, row), null);
  await assert.rejects(encryptShareSecret({}, 'share_1', 'alice', secret));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail } from '../functions/_lib/auth.js';
import { hashPassword, verifyPassword } from '../functions/_lib/password.js';
import {
  adminInsertSql,
  parseRowsWritten,
  remoteWranglerArgs,
  sqlString,
  storageMountInsertSql,
  validateStorageName,
  validateStorageProjectId,
} from '../scripts/lib/production-provisioning.js';

test('production provisioning uses the same email normalization as login', () => {
  assert.equal(normalizeEmail('  Admin@Example.Test  '), 'admin@example.test');
  assert.throws(() => normalizeEmail('not-an-email'));
});

test('production admin password hashing uses the Phase 8 PBKDF2 encoding', async () => {
  const hash = await hashPassword('a sufficiently long secret');
  assert.ok(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u.test(hash), 'Admin password hashes must use the shared 100000-iteration format.');
  assert.equal(await verifyPassword('a sufficiently long secret', hash), true);
});

test('admin SQL inserts only an active admin and refuses normalized duplicates', () => {
  const sql = adminInsertSql({
    id: 'uuid-1',
    email: 'admin@example.test',
    displayName: 'Site Admin',
    passwordHash: 'pbkdf2-sha256$100000$salt$digest',
    now: 123,
  });
  assert.match(sql, /'admin', 1, 123, 123/u);
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM users WHERE email = 'admin@example\.test' COLLATE NOCASE\)/u);
  assert.equal(sqlString("O'Brien"), "'O''Brien'");
});

test('mount SQL resolves an active user and rejects duplicate name or project mappings', () => {
  const sql = storageMountInsertSql({ id: 'uuid-2', email: 'owner@example.test', name: 'Archive', projectId: 'p_123', now: 456 });
  assert.match(sql, /SELECT 'uuid-2', users\.id/u);
  assert.match(sql, /'garage', 'active', 0, 'p_123'/u);
  assert.match(sql, /users\.email = 'owner@example\.test' COLLATE NOCASE\s+AND users\.active = 1/u);
  assert.match(sql, /lower\(name\) = lower\('Archive'\) OR shared_storage_project_id = 'p_123'/u);
  for (const forbidden of ['STORAGE_APP_SECRET', 'CF_ACCESS', 'garage_key', 'bucket', 'physical_path']) assert.equal(sql.includes(forbidden), false);
});

test('production D1 command is explicitly remote and SQL is passed through a private file', () => {
  assert.deepEqual(remoteWranglerArgs('/private/tmp/statement.sql'), [
    'exec', 'wrangler', 'd1', 'execute', 'nexora-db', '--remote', '--json', '--file=/private/tmp/statement.sql',
  ]);
  assert.equal(remoteWranglerArgs('/tmp/sql').includes('--local'), false);
});

test('mount configuration values are bounded and D1 write counts are parsed safely', () => {
  assert.equal(validateStorageProjectId('project_01'), 'project_01');
  assert.throws(() => validateStorageProjectId('bad/project'));
  assert.equal(validateStorageName('  Archive  '), 'Archive');
  assert.throws(() => validateStorageName('  '));
  assert.throws(() => validateStorageName('bad\nname'));
  assert.equal(parseRowsWritten('[{"success":true,"meta":{"rows_written":1}}]'), 1);
  assert.equal(parseRowsWritten('[{"success":true,"meta":{"rows_written":0}}]'), 0);
  assert.throws(() => parseRowsWritten('not json'));
});

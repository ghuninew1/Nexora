import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { STORAGE_PERMISSION_NAMES, validateStoragePermissions } from '../functions/_lib/storage-permissions.js';

test('storage permissions reject missing, unknown, non-boolean and inconsistent values', () => {
  const all = Object.fromEntries(STORAGE_PERMISSION_NAMES.map(name => [name, true]));
  assert.deepEqual(validateStoragePermissions(all), all);
  assert.throws(() => validateStoragePermissions({ ...all, role: 'admin' }));
  assert.throws(() => validateStoragePermissions({ ...all, read: false }));
  assert.throws(() => validateStoragePermissions({ ...all, delete: false }));
  assert.throws(() => validateStoragePermissions({ ...all, share: false }));
  assert.throws(() => validateStoragePermissions({ ...all, read: 1 }));
  const missing = { ...all }; delete missing.copy;
  assert.throws(() => validateStoragePermissions(missing));
});

test('storage access migration enforces ownership references, uniqueness and dependencies', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_backend_foundation.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../migrations/0008_storage_access.sql', import.meta.url), 'utf8'));
    db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, 'user', 1, 1, 1)").run('u', 'u@example.test', 'User', 'hash');
    db.prepare("INSERT INTO storage_mounts VALUES (?, ?, ?, 'garage', 'active', 0, ?, 1, 1)").run('m', 'u', 'Storage', 'project');
    db.prepare('INSERT INTO storage_access (user_id, storage_id, can_read, can_download, created_at, updated_at) VALUES (?, ?, 1, 1, 1, 1)').run('u', 'm');
    assert.throws(() => db.prepare('INSERT INTO storage_access (user_id, storage_id, created_at, updated_at) VALUES (?, ?, 1, 1)').run('u', 'm'));
    assert.throws(() => db.prepare('UPDATE storage_access SET can_read = 0 WHERE user_id = ?').run('u'));
    assert.throws(() => db.prepare('INSERT INTO storage_access (user_id, storage_id, created_at, updated_at) VALUES (?, ?, 1, 1)').run('unknown', 'm'));
  } finally { db.close(); }
});

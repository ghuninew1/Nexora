import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { STORAGE_PERMISSION_NAMES, validateStoragePermissions, requiredStoragePermissions, intersectStoragePermissions } from '../functions/_lib/storage-permissions.js';
import { getStorageAccessForUser, requireStoragePermission } from '../functions/_lib/storage-access.js';

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

test('storage route permission map covers file operations and fails closed for unknown paths', () => {
  const cases = [
    ['GET', ['objects'], ['read']], ['GET', ['objects', 'id'], ['read']],
    ['GET', ['objects', 'id', 'preview'], ['read', 'preview']],
    ['GET', ['objects', 'id', 'download'], ['read', 'download']],
    ['GET', ['files', 'id', 'download'], ['read', 'download']],
    ['POST', ['files'], ['upload']], ['POST', ['folders'], ['createFolder']],
    ['PATCH', ['objects', 'id'], ['rename']], ['POST', ['objects', 'id', 'move'], ['move']],
    ['POST', ['objects', 'id', 'copy'], ['copy']], ['DELETE', ['objects', 'id'], ['delete']],
    ['GET', ['trash'], ['read', 'delete']], ['POST', ['trash', 'id', 'restore'], ['delete']],
    ['DELETE', ['trash', 'id', 'permanent'], ['permanentDelete']],
  ];
  for (const [method, path, expected] of cases) assert.deepEqual(requiredStoragePermissions(method, path), expected);
  assert.throws(() => requiredStoragePermissions('POST', ['objects', 'id', 'unknown']));
  assert.throws(() => requiredStoragePermissions('DELETE', ['capabilities']));
});

test('effective permissions only narrow grants according to provider and policy', () => {
  const grants = Object.fromEntries(STORAGE_PERMISSION_NAMES.map(name => [name, true]));
  const caps = { list: true, stat: true, download: true, upload: true, createFolder: true, rename: true, move: true, copy: true, trash: true, permanentDelete: true };
  assert.equal(intersectStoragePermissions(grants, caps).upload, true);
  assert.equal(intersectStoragePermissions(grants, { ...caps, upload: false }).upload, false);
  const readOnly = intersectStoragePermissions(grants, caps, { readOnly: true });
  assert.equal(readOnly.read, true);
  assert.equal(readOnly.download, true);
  assert.equal(readOnly.upload, false);
  assert.equal(readOnly.permanentDelete, false);
  const maintenance = intersectStoragePermissions(grants, caps, { maintenance: true });
  assert.equal(maintenance.favorite, false);
  assert.equal(maintenance.share, false);
  assert.equal(maintenance.preview, true);
  assert.equal(intersectStoragePermissions(grants, {}).read, false);
});

test('storage access migration enforces ownership references, uniqueness and dependencies', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_backend_foundation.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../migrations/0008_storage_access.sql', import.meta.url), 'utf8'));
    db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, 'user', 1, 1, 1)").run('u', 'u@example.test', 'User', 'hash');
    db.prepare("INSERT INTO storage_mounts (id, owner_user_id, name, provider, status, read_only, shared_storage_project_id, created_at, updated_at) VALUES (?, ?, ?, 'garage', 'active', 0, ?, 1, 1)").run('m', 'u', 'Storage', 'project');
    db.prepare('INSERT INTO storage_access (user_id, storage_id, can_read, can_download, created_at, updated_at) VALUES (?, ?, 1, 1, 1, 1)').run('u', 'm');
    assert.throws(() => db.prepare('INSERT INTO storage_access (user_id, storage_id, created_at, updated_at) VALUES (?, ?, 1, 1)').run('u', 'm'));
    assert.throws(() => db.prepare('UPDATE storage_access SET can_read = 0 WHERE user_id = ?').run('u'));
    assert.throws(() => db.prepare('INSERT INTO storage_access (user_id, storage_id, created_at, updated_at) VALUES (?, ?, 1, 1)').run('unknown', 'm'));
  } finally { db.close(); }
});

test('default migration preserves assignments, backfills owners and enforces one default', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_backend_foundation.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../migrations/0008_storage_access.sql', import.meta.url), 'utf8'));
    db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, 'user', 1, 1, 1)").run('u', 'u@example.test', 'User', 'hash');
    const mount = db.prepare("INSERT INTO storage_mounts (id, owner_user_id, name, provider, status, read_only, shared_storage_project_id, created_at, updated_at) VALUES (?, ?, ?, 'garage', 'active', 0, ?, 1, 1)");
    mount.run('m1', 'u', 'One', 'p1');
    mount.run('m2', 'u', 'Two', 'p2');
    db.prepare('INSERT INTO storage_access (user_id, storage_id, can_read, created_at, updated_at) VALUES (?, ?, 1, 1, 1)').run('u', 'm1');
    db.exec(readFileSync(new URL('../migrations/0009_storage_access_defaults.sql', import.meta.url), 'utf8'));
    assert.equal(db.prepare('SELECT can_upload FROM storage_access WHERE storage_id = ?').get('m1').can_upload, 0);
    assert.equal(db.prepare('SELECT can_upload FROM storage_access WHERE storage_id = ?').get('m2').can_upload, 1);
    db.prepare('UPDATE storage_access SET is_default = 1 WHERE storage_id = ?').run('m1');
    assert.throws(() => db.prepare('UPDATE storage_access SET is_default = 1 WHERE storage_id = ?').run('m2'));
  } finally { db.close(); }
});

test('central access lookup scopes assignments and intersects provider and maintenance policy', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of ['0001_backend_foundation.sql', '0007_system_settings.sql', '0008_storage_access.sql', '0009_storage_access_defaults.sql', '0010_storage_description.sql']) {
      db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
    const insertUser = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, 'user', 1, 1, 1)");
    insertUser.run('owner', 'owner@example.test', 'Owner', 'hash');
    insertUser.run('member', 'member@example.test', 'Member', 'hash');
    db.prepare("INSERT INTO storage_mounts (id, owner_user_id, name, provider, status, read_only, shared_storage_project_id, created_at, updated_at) VALUES (?, ?, ?, 'garage', 'active', 0, ?, 1, 1)").run('m', 'owner', 'Storage', 'project');
    db.prepare('INSERT INTO storage_access (user_id, storage_id, can_read, can_download, can_upload, created_at, updated_at) VALUES (?, ?, 1, 1, 1, 1, 1)').run('member', 'm');
    const d1 = { prepare: sql => ({ bind: (...args) => ({
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }) }) };
    const env = { DB: d1, STORAGE_API_URL: 'https://storage.example.test', STORAGE_APP_SECRET: 'test', CF_ACCESS_CLIENT_ID: 'test', CF_ACCESS_CLIENT_SECRET: 'test' };
    const context = { env, user: { id: 'member', role: 'user' }, storageId: 'm', request: new Request('https://example.test/'),
      fetchImpl: async () => Response.json({ capabilities: { list: true, stat: true, download: true, upload: false } }) };
    assert.equal((await getStorageAccessForUser(d1, context.user, 'm')).grants.upload, true);
    assert.equal(await getStorageAccessForUser(d1, { id: 'owner' }, 'm'), null);
    assert.equal((await requireStoragePermission(context, 'download')).permissions.download, true);
    await assert.rejects(requireStoragePermission(context, 'upload'), error => error.status === 403);
    context.fetchImpl = async () => Response.json({ capabilities: { list: true, stat: true, download: true, upload: true } });
    assert.equal((await requireStoragePermission(context, 'upload')).permissions.upload, true);
    db.prepare('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, 1)').run('maintenanceMode', 'true');
    await assert.rejects(requireStoragePermission(context, 'upload'), error => error.status === 403);
    db.prepare('DELETE FROM system_settings WHERE key = ?').run('maintenanceMode');
    db.prepare('UPDATE storage_mounts SET read_only = 1 WHERE id = ?').run('m');
    await assert.rejects(requireStoragePermission(context, 'upload'), error => error.status === 403);
    db.prepare('UPDATE storage_access SET can_read = 0, can_download = 0 WHERE user_id = ?').run('member');
    await assert.rejects(requireStoragePermission(context, 'read'), error => error.status === 403);
    db.prepare('DELETE FROM storage_access WHERE user_id = ?').run('member');
    await assert.rejects(requireStoragePermission(context, 'read'), error => error.status === 404);
  } finally { db.close(); }
});

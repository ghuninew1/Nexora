import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApiHandler } from '../functions/_lib/api.js';
import { recordActivity } from '../functions/_lib/activity.js';
import { randomToken, sha256Hex } from '../functions/_lib/password.js';

function d1(database) {
  return { prepare(sql) { return { bind(...values) { return {
    async first() { return database.prepare(sql).get(...values) ?? null; },
    async all() { return { results: database.prepare(sql).all(...values) }; },
    async run() { return { success: true, meta: database.prepare(sql).run(...values) }; },
  }; } }; } };
}

async function fixture() {
  const database = new DatabaseSync(':memory:');
  for (const file of ['0001_backend_foundation.sql', '0002_public_shares.sql', '0003_activity_events.sql']) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const cookies = {};
  for (const id of ['alice', 'bob']) {
    database.prepare("INSERT INTO users VALUES (?,?,'Test User','hash','user',1,1,1)").run(id, `${id}@example.test`);
    const token = randomToken();
    cookies[id] = `nexora_session=${token}`;
    database.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(`session_${id}`, id, await sha256Hex(token), Date.now() + 60_000, Date.now(), Date.now());
  }
  const env = { DB: d1(database) };
  const handler = createApiHandler();
  async function call(path, { user = 'alice', method = 'GET' } = {}) {
    return handler(new Request(`https://nexora.test${path}`, {
      method,
      ...(user ? { headers: { Cookie: cookies[user] } } : {}),
    }), env);
  }
  return { database, env, cookies, call };
}

test('activity writer allowlists action metadata, bounds text, and does not throw for unknown action', async () => {
  const f = await fixture();
  const user = { id: 'alice' };
  assert.equal(await recordActivity(f.env.DB, user, {
    action: 'rename', storageMountId: 'mount_a', storageName: 'Home', objectId: 'file_a', objectType: 'file',
    objectName: 'renamed.pdf\nname', metadata: { previousName: 'draft.pdf', newName: 'renamed.pdf', secret: 'must-not-be-stored', publicPath: '/s/id/secret' },
  }, { logger: { warn() {} }, now: () => 1_800_000_000_000 }), true);
  assert.equal(await recordActivity(f.env.DB, user, { action: 'invented' }, { logger: { warn() {} } }), false);
  const row = f.database.prepare('SELECT * FROM activity_events WHERE user_id = ?').get('alice');
  assert.equal(row.object_name, 'renamed.pdf name');
  assert.deepEqual(JSON.parse(row.metadata_json), { previousName: 'draft.pdf', newName: 'renamed.pdf' });
  assert.doesNotMatch(row.metadata_json, /secret|publicPath/u);
  f.database.close();
});

test('activity writer removes events older than 180 days and retains at most 500 per user', async () => {
  const f = await fixture();
  const now = 1_800_000_000_000;
  const cutoff = now - 180 * 24 * 60 * 60 * 1000;
  f.database.prepare(`INSERT INTO activity_events (id,user_id,action,created_at) VALUES ('old','alice','upload',?)`).run(cutoff - 1);
  for (let index = 0; index < 501; index += 1) {
    await recordActivity(f.env.DB, { id: 'alice' }, { action: 'upload', objectId: `object_${index}` }, { logger: { warn() {} }, now: () => now + index });
  }
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM activity_events WHERE user_id = ?').get('alice').count, 500);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE user_id = ? AND id = 'old'").get('alice').count, 0);
  f.database.close();
});

test('activity persistence failure is best-effort and logs no event data', async () => {
  const lines = [];
  const brokenDb = { prepare() { return { bind() { return { async run() { throw new Error('secret provider project'); } }; } }; } };
  const persisted = await recordActivity(brokenDb, { id: 'alice' }, { action: 'upload', objectName: 'private filename.txt' }, {
    logger: { warn: (line) => lines.push(line) },
  });
  assert.equal(persisted, false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /action=upload stage=insert/u);
  assert.doesNotMatch(lines[0], /secret|provider|project|filename/u);
});

test('activity API is authenticated, owner-scoped, bounded, newest-first, and cursor-paginated', async () => {
  const f = await fixture();
  for (let index = 0; index < 55; index += 1) {
    f.database.prepare(`INSERT INTO activity_events (id,user_id,storage_mount_id,action,object_id,object_name,object_type,metadata_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(`event_${String(index).padStart(3, '0')}`, 'alice', 'mount_a', 'upload', `object_${index}`, `file-${index}.txt`, 'file', null, 1000 + index);
  }
  f.database.prepare(`INSERT INTO activity_events (id,user_id,action,created_at) VALUES ('bob_event','bob','trash',2000)`).run();

  assert.equal((await f.call('/api/activity', { user: null })).status, 401);
  const firstResponse = await f.call('/api/activity');
  const first = (await firstResponse.json()).data;
  assert.equal(first.items.length, 50);
  assert.equal(first.items[0].objectName, 'file-54.txt');
  assert.ok(first.nextCursor);
  assert.equal(Object.hasOwn(first.items[0], 'userId'), false);
  const second = (await (await f.call(`/api/activity?limit=10&cursor=${first.nextCursor}`)).json()).data;
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  const bob = (await (await f.call('/api/activity', { user: 'bob' })).json()).data;
  assert.deepEqual(bob.items.map((item) => item.id), ['bob_event']);
  assert.equal((await f.call('/api/activity?limit=101')).status, 400);
  assert.equal((await f.call('/api/activity?cursor=malformed')).status, 400);
  assert.equal((await f.call('/api/activity', { method: 'POST' })).status, 404);
  f.database.close();
});

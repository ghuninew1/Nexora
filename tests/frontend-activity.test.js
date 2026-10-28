import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatActivity, listActivity, normalizeActivityEvent } from '../src/services/activity.js';

test('activity service requests bounded same-origin cursor pages and normalizes safe fields', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { items: [{ id: 'evt_1', action: 'upload', objectName: 'report.pdf', objectType: 'file',
      createdAt: '2026-10-28T00:00:00.000Z', userId: 'private', projectId: 'private' }], nextCursor: 'opaque_cursor' } });
  };
  const first = await listActivity({ fetchImpl });
  const second = await listActivity({ cursor: first.nextCursor, limit: 10, fetchImpl });
  assert.equal(calls[0].url, '/api/activity?limit=50');
  assert.equal(calls[1].url, '/api/activity?limit=10&cursor=opaque_cursor');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(first.items[0].action, 'upload');
  assert.equal(Object.hasOwn(first.items[0], 'userId'), false);
  assert.equal(Object.hasOwn(first.items[0], 'projectId'), false);
  assert.equal(second.nextCursor, 'opaque_cursor');
});

test('activity formatter handles known and unknown actions without throwing', () => {
  assert.equal(formatActivity({ action: 'rename', objectName: 'report.pdf', metadata: { previousName: 'draft.pdf', newName: 'report.pdf' } }), 'Renamed draft.pdf to report.pdf');
  assert.equal(formatActivity({ action: 'share_revoke', objectName: 'report.pdf' }), 'Revoked the public link for report.pdf');
  assert.equal(formatActivity({ action: 'future_action', objectName: 'ignored' }), 'File activity');
  const unknown = normalizeActivityEvent({ id: 'event', action: 'future_action', createdAt: '2026-10-28T00:00:00.000Z', metadata: { secret: 'private' } });
  assert.equal(unknown.action, 'unknown');
  assert.equal(unknown.metadata, null);
});

test('activity client exposes safe errors and preserves AbortError', async () => {
  await assert.rejects(listActivity({ fetchImpl: async () => Response.json({}, { status: 500 }) }), /Activity could not be loaded/u);
  await assert.rejects(listActivity({ fetchImpl: async () => { throw new DOMException('aborted', 'AbortError'); } }), { name: 'AbortError' });
  await assert.rejects(listActivity({ limit: 101 }), /invalid/u);
});

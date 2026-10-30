import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFileClipboard, invalidCutDestination, remainingCutClipboard } from '../src/utils/file-clipboard.js';

test('clipboard starts empty and successful cut clears it', () => {
  assert.deepEqual(emptyFileClipboard(), { mode: null, items: [], sourceStorageId: null, sourceParentId: null });
  const clip = { mode: 'cut', items: [{ objectId: 'a' }, { objectId: 'b' }], sourceStorageId: 's', sourceParentId: null };
  assert.deepEqual(remainingCutClipboard(clip, clip, ['a', 'b']), emptyFileClipboard());
  assert.deepEqual(remainingCutClipboard(clip, clip, ['a']).items, [{ objectId: 'b' }]);
  const replacement = { ...clip, mode: 'copy' };
  assert.equal(remainingCutClipboard(replacement, clip, ['a', 'b']), replacement);
});

test('cut folder rejects itself, descendants and unverifiable paths', () => {
  const folder = { type: 'folder', objectId: 'a', parentId: null };
  assert.ok(invalidCutDestination([folder], 'a', [{ objectId: null }, { objectId: 'a' }], false));
  assert.ok(invalidCutDestination([folder], 'b', [{ objectId: null }, { objectId: 'a' }, { objectId: 'b' }], false));
  assert.ok(invalidCutDestination([folder], 'b', [{ objectId: null }, { objectId: 'b' }], true));
  assert.ok(invalidCutDestination([folder], 'b', [{ objectId: null }], false));
  assert.equal(invalidCutDestination([folder], 'b', [{ objectId: null }, { objectId: 'b' }], false), false);
});

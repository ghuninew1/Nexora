import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectDefaultStorage } from '../src/utils/default-storage.js';

test('default storage respects explicit accessible route, preference and safe fallback', () => {
  const storages = [{ storageId: 'a', status: 'active' }, { storageId: 'b', status: 'active' }, { storageId: 'c', status: 'inactive' }];
  assert.equal(selectDefaultStorage(storages, 'a', 'b').storageId, 'a');
  assert.equal(selectDefaultStorage(storages, null, 'b').storageId, 'b');
  assert.equal(selectDefaultStorage(storages, 'foreign', 'c').storageId, 'a');
  assert.equal(selectDefaultStorage([], 'a', 'b'), null);
});

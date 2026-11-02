import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preset, presetName, updatePermission } from '../src/components/admin/storage-assignment-permissions.js';

test('assignment presets follow the access model and custom changes are recognized', () => {
  const viewer = preset('Viewer');
  assert.equal(viewer.read && viewer.preview && viewer.download, true);
  assert.equal(viewer.upload, false);
  assert.equal(preset('Contributor').upload, true);
  assert.equal(preset('Contributor').rename, false);
  assert.equal(preset('Editor').delete, true);
  assert.equal(preset('Editor').permanentDelete, false);
  assert.equal(preset('Full Access').manageShare, true);
  assert.equal(presetName(updatePermission(viewer, 'rename', true)), 'Custom');
});

test('assignment permission controls clear dependent grants', () => {
  const full = preset('Full Access');
  const noRead = updatePermission(full, 'read', false);
  assert.equal(noRead.preview || noRead.download || noRead.favorite, false);
  assert.equal(updatePermission(full, 'delete', false).permanentDelete, false);
  assert.equal(updatePermission(full, 'share', false).manageShare, false);
});

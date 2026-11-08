import test from 'node:test';
import assert from 'node:assert/strict';
import { folderManifest, directoryFiles, droppedEntries, safePath } from '../src/utils/folder-upload.js';
const file = name => ({ name, size: 1 });
test('manifest preserves nesting, Thai, extensions and explicit empty folders', () => {
  const entries = folderManifest([{ kind: 'file', path: 'โครงการ/เอกสาร/a.b.pdf', file: file('a.b.pdf') }, { kind: 'folder', path: 'โครงการ/ว่าง' }]);
  assert.deepEqual(new Set(entries.map(e => e.path)), new Set(['โครงการ', 'โครงการ/เอกสาร', 'โครงการ/เอกสาร/a.b.pdf', 'โครงการ/ว่าง']));
  assert.equal(entries[0].kind, 'folder');
});
test('unsafe paths, duplicates, conflicting types and bounds fail before admission', () => {
  for (const path of ['../x', '/x', 'a/../x', 'a\\b', 'C:/x', 'a//b', './x', 'a/\u0000b']) assert.throws(() => safePath(path));
  assert.throws(() => folderManifest([{ kind: 'file', path: 'a', file: file('a') }, { kind: 'file', path: 'a', file: file('a') }]));
  assert.throws(() => folderManifest(Array.from({ length: 51 }, (_, i) => ({ kind: 'folder', path: `a${i}` }))));
  assert.throws(() => folderManifest([{ kind: 'file', path: 'a', file: file('a') }, { kind: 'folder', path: 'a/b' }]));
});
test('directory picker uses relative path and refuses unsupported picker output', () => {
  assert.equal(directoryFiles([{ ...file('x'), webkitRelativePath: 'root/x' }]).length, 2);
  assert.throws(() => directoryFiles([file('x')]));
});
test('drop traversal drains reader pages and preserves empty directories', async () => {
  const f = { name: 'ไทย.txt', isFile: true, file: resolve => resolve(file('ไทย.txt')) };
  const empty = { name: 'empty', isDirectory: true, createReader: () => ({ readEntries: resolve => resolve([]) }) };
  const root = { name: 'root', isDirectory: true, createReader: () => { let page = 0; return { readEntries: resolve => resolve([[f], [empty], []][page++]) }; } };
  const entries = await droppedEntries([{ webkitGetAsEntry: () => root }], []);
  assert.deepEqual(entries.map(e => e.path), ['root', 'root/empty', 'root/ไทย.txt']);
  assert.equal(await droppedEntries([], [file('x')]), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFolderZip, collectSelectedZip, buildFolderZip, MAX_ZIP_BYTES, MAX_ZIP_ENTRIES } from '../src/utils/folder-zip.js';
const folder = (objectId, name, parentId = null) => ({ objectId, name, parentId, type: 'folder' });
const file = (objectId, name, parentId, sizeBytes = 5) => ({ objectId, name, parentId, sizeBytes, type: 'file' });
const root = folder('r', 'โครงการ');
const stream = text => new Blob([text]).stream();
async function fixture() {
  return collectFolderZip(root, { list: async id => ({ items: id === 'r' ? [folder('sub', 'sub', 'r'), folder('empty', 'empty', 'r'), file('f', 'ไทย.txt', 'r')] : id === 'sub' ? [file('g', 'a.pdf', 'sub', 3)] : [], nextCursor: null }) });
}
test('ZIP roundtrip in independent Python zipfile validates CRC, UTF-8, empty folders and nested contents', async () => {
  const manifest = await fixture(); let active = 0, maxActive = 0;
  const blob = await buildFolderZip(manifest, { read: async entry => { active++; maxActive = Math.max(maxActive, active); active--; return stream(entry.objectId === 'f' ? 'hello' : 'pdf'); } });
  const zip = new Uint8Array(await blob.arrayBuffer());
  const code = `import io,sys,zipfile,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
assert z.read('โครงการ/ไทย.txt') == b'hello'
assert z.read('โครงการ/sub/a.pdf') == b'pdf'
assert z.getinfo('โครงการ/empty/').is_dir()
print(json.dumps(z.namelist(),ensure_ascii=False))`;
  const result = spawnSync('python3', ['-c', code], { input: zip, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /ไทย.txt/); assert.equal(maxActive, 1);
});
test('single empty folder is a valid extractable ZIP', async () => {
  const manifest = await collectFolderZip(root, { list: async () => ({ items: [], nextCursor: null }) });
  const blob = await buildFolderZip(manifest, { read: () => assert.fail('must not fetch') });
  const result = spawnSync('python3', ['-c', "import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert len(z.infolist())==1; assert z.infolist()[0].is_dir(); assert z.testzip() is None"], { input: new Uint8Array(await blob.arrayBuffer()) });
  assert.equal(result.status, 0);
});
test('pagination is exhausted and malformed ancestry, cycles, duplicate paths and unsafe names fail closed', async () => {
  const cursors = [];
  const m = await collectFolderZip(root, { list: async (id, cursor) => { cursors.push(cursor); return { items: [file(cursor ? 'g' : 'f', cursor ? 'b' : 'a', 'r')], nextCursor: cursor ? null : 'next' }; } });
  assert.equal(m.entries.length, 3); assert.deepEqual(cursors, [null, 'next']);
  for (const items of [[folder('r', 'loop', 'r')], [file('f', '../bad', 'r')], [file('f', 'ok', 'foreign')], [file('f', 'same', 'r'), file('g', 'same', 'r')], [file('f', 'C:evil', 'r')]]) {
    await assert.rejects(collectFolderZip(root, { list: async () => ({ items, nextCursor: null }) }));
  }
  await assert.rejects(collectFolderZip(root, { list: async () => ({ items: [], nextCursor: 'same' }) }), /repeated cursor/);
});
test('size, count, depth and unknown sizes are rejected during discovery before content fetches', async () => {
  for (const size of [MAX_ZIP_BYTES + 1, null, -1]) await assert.rejects(collectFolderZip(root, { list: async () => ({ items: [file('f', 'big', 'r', size)], nextCursor: null }) }));
  await assert.rejects(collectFolderZip(root, { list: async () => ({ items: Array.from({ length: MAX_ZIP_ENTRIES }, (_, i) => file('f' + i, '' + i, 'r', 0)), nextCursor: null }) }), /500/);
  await assert.rejects(collectFolderZip(root, { list: async id => ({ items: [folder(id + 'x', 'x', id)], nextCursor: null }) }), /Unsafe/);
});
test('download errors, truncated/excess bodies and cancellation never return a partial ZIP', async () => {
  const m = await fixture();
  await assert.rejects(buildFolderZip(m, { read: async () => { throw new Error('Permission revoked'); } }), /Permission/);
  await assert.rejects(buildFolderZip(m, { read: async () => stream('too long') }), /size changed/);
  await assert.rejects(buildFolderZip(m, { read: async () => stream('') }), /truncated/);
  const controller = new AbortController();
  await assert.rejects(buildFolderZip(m, { signal: controller.signal, read: async () => stream('pdf'), onProgress: p => { if (p.transferred) controller.abort(); } }), { name: 'AbortError' });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(collectFolderZip(root, { signal: cancelled.signal, list: () => assert.fail('no request') }), { name: 'AbortError' });
});

for (const kind of ['files', 'folders', 'mixed']) {
  test(`multiple roots: ${kind} preserve UTF-8 names, nested/empty folders and independent extraction integrity`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 9, 13, 14, 59) });
    const a = file('a', 'รายงาน.pdf', null, 3), b = file('b', 'image.png', null, 3);
    const project = folder('p', 'Project-A'), other = folder('o', 'โครงการ-B');
    const roots = kind === 'files' ? [a, b] : kind === 'folders' ? [project, other] : [a, b, project, other];
    const progress = [];
    const manifest = await collectSelectedZip(roots, { onProgress: p => progress.push(p), list: async id => ({
      items: id === 'p' ? [folder('docs', 'Documents', 'p'), folder('empty', 'Empty', 'p')]
        : id === 'docs' ? [file('notes', 'บันทึก.txt', 'docs', 3)] : [], nextCursor: null }) });
    const blob = await buildFolderZip(manifest, { read: async () => stream('abc') });
    const result = spawnSync('python3', ['-c', `import io,sys,zipfile,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
for e in z.infolist():
 assert e.date_time == (2026,11,9,13,14,58)
 if not e.is_dir(): assert z.read(e) == b'abc'
print(json.dumps(z.namelist(),ensure_ascii=False))`], { input: new Uint8Array(await blob.arrayBuffer()), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), manifest.entries.map(e => e.path + (e.type === 'folder' ? '/' : '')));
    assert.equal(progress.at(-1).discoveredEntries, manifest.entries.length);
    if (kind !== 'files') assert.match(result.stdout, /Project-A\/Empty\//);
  });
}
test('multiple roots share size/count budgets and reject duplicate/overlapping paths and unsafe root names', async () => {
  const empty = async () => ({ items: [], nextCursor: null });
  await assert.rejects(collectSelectedZip([file('a', 'a', null, MAX_ZIP_BYTES / 2 + 1), file('b', 'b', null, MAX_ZIP_BYTES / 2)], { list: empty }), /64 MiB/);
  await assert.rejects(collectSelectedZip([folder('a', 'a'), folder('b', 'b')], { list: async id => ({ items: Array.from({ length: 250 }, (_, i) => file(id + i, String(i), id, 0)), nextCursor: null }) }), /500/);
  for (const roots of [[file('a', 'same', null), file('b', 'same', null)], [folder('a', 'same'), folder('b', 'same')], [file('a', 'same', null), folder('b', 'same')], [file('a', 'x', null), file('a', 'y', null)], [file('a', '../x', null), file('b', 'b', null)]]) {
    await assert.rejects(collectSelectedZip(roots, { list: empty }));
  }
  await assert.rejects(collectSelectedZip([folder('a', 'a'), file('b', 'b', 'a')], { list: async () => ({ items: [file('b', 'b', 'a')], nextCursor: null }) }), /duplicate/);
});
test('cancelling a pending stream read releases the reader and never returns a partial ZIP', async () => {
  const manifest = await collectSelectedZip([file('a', 'a', null)], { list: () => assert.fail('files do not list') });
  const controller = new AbortController(); let cancelled = false;
  const pending = buildFolderZip(manifest, { signal: controller.signal, read: async () => new ReadableStream({
    pull() { setTimeout(() => controller.abort(), 0); }, cancel() { cancelled = true; }
  }) });
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cancelled, true);
});


test('archive creation local time is captured once for all files, nested and empty directories in both headers', async t => {
  const created = new Date(2026, 10, 9, 23, 59, 59, 999);
  t.mock.timers.enable({ apis: ['Date'], now: created });
  const manifest = await fixture();
  const blob = await buildFolderZip(manifest, { read: async entry => {
    t.mock.timers.tick(5000); // Crossing midnight must not change later entry timestamps.
    return stream(entry.objectId === 'f' ? 'hello' : 'pdf');
  } });
  const result = spawnSync('python3', ['-c', `import io,sys,struct,zipfile
raw=sys.stdin.buffer.read(); z=zipfile.ZipFile(io.BytesIO(raw))
expected=(2026,11,9,23,59,58)
assert z.testzip() is None
assert z.read('โครงการ/ไทย.txt')==b'hello'
assert z.read('โครงการ/sub/a.pdf')==b'pdf'
assert z.getinfo('โครงการ/empty/').is_dir()
for entry in z.infolist():
 assert entry.date_time==expected, (entry.filename,entry.date_time)
 time,date=struct.unpack_from('<HH',raw,entry.header_offset+10)
 assert (1980+(date>>9),(date>>5)&15,date&31,time>>11,(time>>5)&63,(time&31)*2)==expected
`], { input: new Uint8Array(await blob.arrayBuffer()), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('DOS timestamps use local calendar fields across timezones and clamp the entire supported date range', () => {
  const moduleUrl = new URL('../src/utils/folder-zip.js', import.meta.url).href;
  const cases = [
    ['Asia/Bangkok', '2026-11-09T18:04:59.987Z', [2026,11,10,1,4,58]],
    ['Pacific/Honolulu', '2026-11-09T18:04:59.987Z', [2026,11,9,8,4,58]],
    ['UTC', '2026-11-09T18:04:59.987Z', [2026,11,9,18,4,58]],
    ['UTC', '2024-02-29T12:34:57.999Z', [2024,2,29,12,34,56]],
    ['UTC', '1979-12-31T23:59:59Z', [1980,1,1,0,0,0]],
    ['UTC', '1980-01-01T00:00:01Z', [1980,1,1,0,0,0]],
    ['UTC', '2107-12-31T23:59:59Z', [2107,12,31,23,59,58]],
    ['UTC', '2108-02-29T12:34:57Z', [2107,12,31,23,59,58]],
  ];
  for (const [timezone, instant, expected] of cases) {
    const script = `import { mock } from 'node:test';
import { buildFolderZip } from ${JSON.stringify(moduleUrl)};
mock.timers.enable({apis:['Date'],now:new Date(${JSON.stringify(instant)})});
const blob=await buildFolderZip({entries:[{type:'folder',path:'ไทย'}],bytes:0},{read:()=>{throw new Error('unexpected read')}});
const view=new DataView(await blob.arrayBuffer());
const time=view.getUint16(10,true),date=view.getUint16(12,true);
const central=view.getUint32(view.byteLength-6,true);
if(view.getUint16(central+12,true)!==time || view.getUint16(central+14,true)!==date) throw new Error('Header timestamps differ');
console.log(JSON.stringify([1980+(date>>9),(date>>5)&15,date&31,time>>11,(time>>5)&63,(time&31)*2]));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected, `${timezone}: ${instant}`);
  }
});


test('macOS unzip extraction retains archive creation time for files, nested and empty directories', { skip: process.platform !== 'darwin' }, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 9, 13, 14, 59) });
  const temp = mkdtempSync(join(tmpdir(), 'nexora-zip-time-'));
  try {
    const original = await fixture();
    // macOS ships an older unzip; Unicode paths are checked independently above.
    const manifest = { ...original, entries: original.entries.map(entry => ({ ...entry, path: entry.path.replace('โครงการ', 'project').replace('ไทย.txt', 'thai.txt') })) };
    const blob = await buildFolderZip(manifest, { read: async entry => stream(entry.objectId === 'f' ? 'hello' : 'pdf') });
    const archive = join(temp, 'archive.zip'), output = join(temp, 'extracted');
    writeFileSync(archive, new Uint8Array(await blob.arrayBuffer()));
    const result = spawnSync('/usr/bin/unzip', ['-q', archive, '-d', output], { encoding: 'utf8', env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } });
    assert.equal(result.status, 0, result.stderr);
    for (const entry of manifest.entries) {
      const modified = statSync(join(output, entry.path)).mtime;
      assert.deepEqual([modified.getFullYear(), modified.getMonth() + 1, modified.getDate(), modified.getHours(), modified.getMinutes(), modified.getSeconds()],
        [2026, 11, 9, 13, 14, 58], entry.path);
    }
    assert.equal(readFileSync(join(output, 'project/thai.txt'), 'utf8'), 'hello');
    assert.equal(readFileSync(join(output, 'project/sub/a.pdf'), 'utf8'), 'pdf');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

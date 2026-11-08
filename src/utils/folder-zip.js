import { safePath } from './folder-upload.js';

export const MAX_ZIP_BYTES = 64 * 1024 ** 2;
export const MAX_ZIP_ENTRIES = 500;
export const ZIP_LIMIT_MESSAGE = 'Folder ZIP supports up to 64 MiB of file data, 500 files/folders and 32 path levels. Download larger files individually.';
const fail = message => { throw new Error(message); };
const check = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
function archivePath(path) {
  safePath(path);
  // Reject drive/ADS syntax and Windows aliases instead of renaming entries.
  if (path.split('/').some(p => /[:]/.test(p) || /[. ]$/.test(p))) fail('A name cannot be represented safely in a ZIP archive.');
  return path;
}

export async function collectFolderZip(root, { list, signal }) {
  const entries = [], seen = new Set(), paths = new Set();
  let bytes = 0;
  const add = (object, path) => {
    archivePath(path);
    if (!object.objectId || seen.has(object.objectId) || paths.has(path)) fail('Folder listing contains a cycle or duplicate entry.');
    if (entries.length >= MAX_ZIP_ENTRIES) fail(ZIP_LIMIT_MESSAGE);
    seen.add(object.objectId); paths.add(path);
    if (object.type === 'file') {
      if (!Number.isSafeInteger(object.sizeBytes) || object.sizeBytes < 0) fail('File size is unavailable. Refresh the folder and try again.');
      bytes += object.sizeBytes;
      if (bytes > MAX_ZIP_BYTES) fail(ZIP_LIMIT_MESSAGE);
    } else if (object.type !== 'folder') fail('Unsupported folder entry.');
    const entry = { ...object, path }; entries.push(entry); return entry;
  };
  const visit = async (folder, path) => {
    check(signal); add(folder, path);
    const cursors = new Set(); let cursor = null, pages = 0;
    do {
      check(signal);
      if (++pages > MAX_ZIP_ENTRIES) fail('Folder pagination exceeded the safety limit.');
      const result = await list(folder.objectId, cursor);
      check(signal);
      for (const object of result.items) {
        if (object.parentId !== folder.objectId) fail('Folder listing changed. Refresh and try again.');
        // Each object name must be exactly one segment.
        if (safePath(object.name).length !== 1) fail('Unsafe archive filename.');
        if (object.type === 'folder') await visit(object, path + '/' + object.name);
        else add(object, path + '/' + object.name);
      }
      cursor = result.nextCursor;
      if (cursor !== null) {
        if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) fail('Folder pagination contains a repeated cursor.');
        cursors.add(cursor);
      }
    } while (cursor !== null);
  };
  if (root.type !== 'folder' || safePath(root.name).length !== 1) fail('Folder is unavailable.');
  await visit(root, root.name);
  return { entries, bytes };
}

// Minimal ZIP32 STORE writer: no compression, UTF-8 names, CRC32 and DOS epoch.
// The explicit 64 MiB / 500-entry policy stays well below ZIP64 boundaries.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let n = 0; n < 8; n++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
function header(length) { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; }
export async function buildFolderZip(manifest, { read, signal, onProgress = () => {} }) {
  if (manifest.entries.length > MAX_ZIP_ENTRIES || manifest.bytes > MAX_ZIP_BYTES) fail(ZIP_LIMIT_MESSAGE);
  const chunks = [], central = [], paths = new Set(); let offset = 0, transferred = 0;
  const append = bytes => { chunks.push(bytes); offset += bytes.byteLength; };
  for (const entry of manifest.entries) {
    check(signal);
    archivePath(entry.path);
    if (paths.has(entry.path)) fail('Duplicate ZIP path.'); paths.add(entry.path);
    const folder = entry.type === 'folder', name = new TextEncoder().encode(entry.path + (folder ? '/' : ''));
    if (name.length > 65535) fail('Archive path is too long.');
    const start = offset, size = folder ? 0 : entry.sizeBytes;
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ZIP_BYTES) fail(ZIP_LIMIT_MESSAGE);
    onProgress({ name: entry.path, transferred, total: manifest.bytes, stage: 'downloading' });
    const local = header(30); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0808, true); local.view.setUint16(12, 33, true); local.view.setUint16(26, name.length, true);
    append(local.bytes); append(name);
    let crc = 0xffffffff, received = 0;
    if (!folder) {
      const stream = await read(entry, signal);
      if (signal?.aborted) { await stream.cancel().catch(() => {}); check(signal); }
      const reader = stream.getReader();
      try {
        for (;;) {
          check(signal); const result = await reader.read(); check(signal);
          if (result.done) break;
          const chunk = result.value;
          received += chunk.byteLength; transferred += chunk.byteLength;
          if (received > size || transferred > MAX_ZIP_BYTES) fail('File size changed or ZIP limit exceeded. Refresh and try again.');
          for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
          append(chunk);
          onProgress({ name: entry.path, transferred, total: manifest.bytes, stage: 'downloading' });
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (received !== size) fail('A file was truncated or changed. Refresh and try again.');
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = header(16); descriptor.view.setUint32(0, 0x08074b50, true); descriptor.view.setUint32(4, crc, true);
    descriptor.view.setUint32(8, size, true); descriptor.view.setUint32(12, size, true); append(descriptor.bytes);
    const record = header(46); const v = record.view;
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0808, true);
    v.setUint16(14, 33, true); v.setUint32(16, crc, true); v.setUint32(20, size, true); v.setUint32(24, size, true);
    v.setUint16(28, name.length, true); v.setUint32(38, folder ? 0x10 : 0, true); v.setUint32(42, start, true);
    central.push(record.bytes, name);
  }
  check(signal);
  if (transferred !== manifest.bytes) fail('Folder size changed. Refresh and try again.');
  const centralOffset = offset;
  for (const chunk of central) append(chunk);
  const end = header(22); const v = end.view;
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, manifest.entries.length, true); v.setUint16(10, manifest.entries.length, true);
  v.setUint32(12, offset - centralOffset, true); v.setUint32(16, centralOffset, true); append(end.bytes);
  return new Blob(chunks, { type: 'application/zip' });
}

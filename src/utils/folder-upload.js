// A bounded manifest holds File references only; no file bytes are read here.
export const MAX_FOLDER_ENTRIES = 50;
export function safePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path)) throw new Error('Unsafe folder path.');
  const parts = path.split('/');
  if (parts.length > 32 || parts.some(p => !p.trim() || p === '.' || p === '..' || [...p].some(c => c.codePointAt(0) <= 31 || (c.codePointAt(0) >= 127 && c.codePointAt(0) <= 159)) || new TextEncoder().encode(p).length > 255)) throw new Error('Unsafe folder path.');
  return parts;
}
export function folderManifest(entries) {
  const paths = new Map();
  const add = entry => {
    if (paths.has(entry.path)) {
      if (entry.kind === 'folder' && paths.get(entry.path).kind === 'folder') return;
      throw new Error('Duplicate file or folder path. No uploads were added.');
    }
    if (paths.size >= MAX_FOLDER_ENTRIES) throw new Error('Folder uploads support up to 50 files and folders per selection.');
    paths.set(entry.path, entry);
  };
  for (const entry of entries) {
    const parts = safePath(entry.path);
    for (let n = 1; n < parts.length; n++) add({ kind: 'folder', path: parts.slice(0, n).join('/') });
    if (entry.kind !== 'folder' && (!entry.file || entry.file.name !== parts.at(-1))) throw new Error('Invalid file path.');
    add(entry);
  }
  return [...paths.values()].sort((a, b) => a.path.split('/').length - b.path.split('/').length || (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1));
}
export function directoryFiles(files) {
  function* entries() {
    for (const file of files) {
      if (!file.webkitRelativePath) throw new Error('Directory selection is unavailable. Use Upload to select files.');
      yield { kind: 'file', path: file.webkitRelativePath, file };
    }
  }
  return folderManifest(entries());
}
export async function droppedEntries(items, files) {
  if ((items?.length || 0) > MAX_FOLDER_ENTRIES || (files?.length || 0) > MAX_FOLDER_ENTRIES) throw new Error('Folder uploads support up to 50 files and folders per selection.');
  // Capture entries synchronously while the drag data store is readable.
  const roots = Array.from(items ?? [], item => item.webkitGetAsEntry?.() ?? null);
  const fallback = Array.from(files ?? []);
  if (!roots.some(Boolean)) {
    if (fallback.some(file => !file.type && file.size === 0)) throw new Error('Folder dropping is unavailable. Use Upload Folder or select individual files.');
    return null;
  }
  if (roots.length && roots.every(root => root?.isFile)) return null;
  if (roots.some(root => !root)) throw new Error('Some dropped items cannot be read. Select files or folders again.');
  const entries = [];
  const visit = async (entry, prefix = '') => {
    const path = prefix + entry.name;
    safePath(path);
    if (entries.length >= MAX_FOLDER_ENTRIES) throw new Error('Folder uploads support up to 50 files and folders per selection.');
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      entries.push({ kind: 'file', path, file });
    } else if (entry.isDirectory) {
      entries.push({ kind: 'folder', path });
      const reader = entry.createReader();
      // readEntries returns batches, not necessarily all children at once.
      for (;;) {
        const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await visit(child, path + '/');
      }
    } else throw new Error('Unsupported dropped item.');
  };
  for (const root of roots) await visit(root);
  return folderManifest(entries);
}

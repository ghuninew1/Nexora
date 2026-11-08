import { listStorageObjects, statStorageObject, storageObjectDownloadUrl, StorageApiError } from './storage';
import { buildFolderZip, collectSelectedZip, MAX_ZIP_ENTRIES, ZIP_LIMIT_MESSAGE } from '../utils/folder-zip';

export function downloadFolderZip(storageId, objectId, options = {}) {
  return downloadZip(storageId, [objectId], options, true);
}

export function downloadSelectedZip(storageId, objectIds, options = {}) {
  return downloadZip(storageId, objectIds, options);
}

async function downloadZip(storageId, objectIds, { signal, onProgress, fetchImpl = fetch }, folderOnly = false) {
  if (!Array.isArray(objectIds) || !objectIds.length || objectIds.length > MAX_ZIP_ENTRIES) throw new Error(ZIP_LIMIT_MESSAGE);
  if (new Set(objectIds).size !== objectIds.length) throw new Error('Selection contains duplicate items. Select each item once.');
  onProgress?.({ stage: 'listing', name: '', discoveredEntries: 0, transferred: 0, total: null });
  const roots = [];
  for (const objectId of objectIds) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const root = await statStorageObject(storageId, objectId, { signal });
    if (root.objectId !== objectId || (folderOnly && root.type !== 'folder')) throw new Error('Selected item changed. Refresh and try again.');
    roots.push(root);
  }
  const manifest = await collectSelectedZip(roots, { signal, onProgress,
    list: (parentId, cursor) => listStorageObjects(storageId, { parentId, cursor, limit: 100, signal }) });
  const blob = await buildFolderZip(manifest, { signal, onProgress, read: async entry => {
    const response = await fetchImpl(storageObjectDownloadUrl(storageId, entry.objectId), { credentials: 'same-origin', redirect: 'error', signal });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new StorageApiError(response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE', response.status);
    }
    const length = response.headers.get('Content-Length');
    if (length !== null && Number(length) !== entry.sizeBytes) {
      await response.body.cancel(); throw new Error('File size changed. Refresh and try again.');
    }
    return response.body;
  } });
  return { blob, name: folderOnly ? `${roots[0].name}.zip` : 'Selected-Files.zip', bytes: manifest.bytes, discoveredEntries: manifest.entries.length };
}

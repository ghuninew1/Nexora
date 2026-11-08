import { listStorageObjects, statStorageObject, storageObjectDownloadUrl, StorageApiError } from './storage';
import { buildFolderZip, collectFolderZip } from '../utils/folder-zip';

export async function downloadFolderZip(storageId, objectId, { signal, onProgress, fetchImpl = fetch } = {}) {
  onProgress?.({ stage: 'listing', name: '', transferred: 0, total: null });
  const root = await statStorageObject(storageId, objectId, { signal });
  if (root.objectId !== objectId) throw new Error('Folder changed. Refresh and try again.');
  const manifest = await collectFolderZip(root, { signal, list: (parentId, cursor) => listStorageObjects(storageId, { parentId, cursor, limit: 100, signal }) });
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
  return { blob, name: `${root.name}.zip` };
}

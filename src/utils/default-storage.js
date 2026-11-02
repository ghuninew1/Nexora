export function selectDefaultStorage(storages, routeStorageId, preferredStorageId) {
  const available = storages.filter(storage => storage.status === 'active');
  return available.find(storage => storage.storageId === routeStorageId)
    ?? available.find(storage => storage.storageId === preferredStorageId)
    ?? available[0] ?? null;
}

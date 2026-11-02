export function selectDefaultStorage(storages, routeStorageId, preferredStorageId) {
  const available = storages.filter(storage => storage.status === 'active');
  return available.find(storage => storage.storageId === routeStorageId)
    ?? available.find(storage => storage.storageId === preferredStorageId)
    ?? available.find(storage => storage.isDefault)
    ?? available[0] ?? null;
}

import { mergeStorageObjects } from '../services/storage.js';

export const FOLDER_LIST_CACHE_TTL_MS = 20_000;
export const MAX_FOLDER_CACHE_ENTRIES = 60;
const MAX_OBJECT_METADATA_ENTRIES = 600;
const ROOT_CACHE_ID = '__nexora_root__';

function folderKey(storageId, parentId) {
  return JSON.stringify([storageId, parentId ?? ROOT_CACHE_ID]);
}

function requestKey(storageId, parentId, cursor) {
  return JSON.stringify([storageId, parentId ?? ROOT_CACHE_ID, cursor]);
}

function flattenPages(pages) {
  return pages.reduce((items, page) => mergeStorageObjects(items, page.items), []);
}

export class RemoteFilesCache {
  constructor({ ttlMs = FOLDER_LIST_CACHE_TTL_MS, maxEntries = MAX_FOLDER_CACHE_ENTRIES, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
    this.metadata = new Map();
    this.inFlight = new Map();
    this.epoch = 0;
  }

  get(storageId, parentId) {
    const key = folderKey(storageId, parentId);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  isFresh(entry) {
    return Boolean(entry && this.now() - entry.fetchedAt < this.ttlMs);
  }

  setPage(storageId, parentId, cursor, page) {
    const key = folderKey(storageId, parentId);
    const current = this.entries.get(key);
    const firstPage = { cursor: null, items: page.items, nextCursor: page.nextCursor };
    let pages = [firstPage];
    if (cursor !== null && current) {
      const currentPages = current.pages;
      if (currentPages.at(-1)?.nextCursor === cursor) {
        pages = [...currentPages, { cursor, items: page.items, nextCursor: page.nextCursor }];
      }
    } else if (cursor === null && current?.pages.length > 1
      && current.pages[0].nextCursor === page.nextCursor) {
      // Keep loaded pages only when the authoritative first-page cursor still anchors them.
      pages = [firstPage, ...current.pages.slice(1)];
    }

    this.entries.delete(key);
    this.entries.set(key, {
      storageId,
      parentId: parentId ?? null,
      pages,
      items: flattenPages(pages),
      nextCursor: pages.at(-1)?.nextCursor ?? null,
      fetchedAt: this.now(),
    });
    this.rememberObjects(storageId, page.items);
    this.evictFolders();
    return this.get(storageId, parentId);
  }

  invalidate(storageId, parentId) {
    this.entries.delete(folderKey(storageId, parentId));
  }

  rememberObjects(storageId, objects) {
    if (!this.metadata.has(storageId)) this.metadata.set(storageId, new Map());
    const values = this.metadata.get(storageId);
    for (const object of objects) {
      values.delete(object.objectId);
      values.set(object.objectId, {
        name: object.name,
        parentId: object.parentId ?? null,
        type: object.type,
      });
    }
    while (values.size > MAX_OBJECT_METADATA_ENTRIES) values.delete(values.keys().next().value);
  }

  removeObjectMetadata(storageId, objectId, { includeDescendants = false } = {}) {
    const values = this.metadata.get(storageId);
    const removedIds = new Set([objectId]);
    if (includeDescendants && values) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [candidateId, metadata] of values) {
          if (!removedIds.has(candidateId) && removedIds.has(metadata.parentId)) {
            removedIds.add(candidateId);
            changed = true;
          }
        }
      }
    }

    for (const id of removedIds) this.entries.delete(folderKey(storageId, id));
    for (const [key, request] of this.inFlight) {
      try {
        const [requestStorageId, parentId] = JSON.parse(key);
        if (requestStorageId === storageId && removedIds.has(parentId)) {
          request.controller.abort();
          this.inFlight.delete(key);
        }
      } catch { /* only keys created by this cache are present */ }
    }
    if (values) {
      for (const id of removedIds) values.delete(id);
      if (values.size === 0) this.metadata.delete(storageId);
    }
    return removedIds;
  }

  getBreadcrumbs(storageId, folderId, root) {
    const values = this.metadata.get(storageId);
    if (!values) return null;
    const segments = [];
    const visited = new Set();
    let currentId = folderId;
    while (currentId !== null) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      const metadata = values.get(currentId);
      if (!metadata || metadata.type !== 'folder') return null;
      segments.unshift({ objectId: currentId, label: metadata.name });
      currentId = metadata.parentId;
      if (segments.length > 100) return null;
    }
    return [root, ...segments];
  }

  async fetchPage(storageId, parentId, cursor, loader) {
    const key = requestKey(storageId, parentId, cursor);
    const existing = this.inFlight.get(key);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const epoch = this.epoch;
    const request = { controller, promise: null };
    request.promise = Promise.resolve()
      .then(() => loader(controller.signal))
      .then((page) => {
        if (epoch === this.epoch) this.setPage(storageId, parentId, cursor, page);
        return page;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request.promise;
  }

  evictFolders() {
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  clear() {
    this.epoch += 1;
    for (const { controller } of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
    this.entries.clear();
    this.metadata.clear();
  }
}

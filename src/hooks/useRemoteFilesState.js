import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useStorage } from './useStorage';
import { createStorageFolder, listStorageObjects, mergeStorageObjects, StorageApiError } from '../services/storage';
import { appendBreadcrumb, isValidObjectId, normalizeFileBrowserRouteState, rootBreadcrumbs } from '../utils/storage-files';

const EMPTY_BROWSER_STATE = {
  storageId: null,
  folderId: null,
  items: [],
  nextCursor: null,
  status: 'loading',
  error: null,
  paginationStatus: 'idle',
  paginationError: null,
};

function routeStateFor(storageId, breadcrumbs, notice = null) {
  return {
    fileBrowser: { storageId, breadcrumbs },
    ...(notice ? { fileBrowserNotice: notice } : {}),
  };
}

export default function useRemoteFilesState() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status: storageStatus, activeStorage, capabilities, error: storageError } = useStorage();
  const { expireSession } = useAuth();
  const [browserState, setBrowserState] = useState(EMPTY_BROWSER_STATE);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [notice, setNotice] = useState('');
  const listControllerRef = useRef(null);
  const paginationControllerRef = useRef(null);
  const createControllerRef = useRef(null);
  const generationRef = useRef(0);
  const previousStorageIdRef = useRef(null);
  const requestedFolderId = searchParams.get('folder');
  const storageId = activeStorage?.storageId ?? null;
  const isFilesRoute = location.pathname === '/files';
  const routeState = location.state?.fileBrowser;
  const routeBreadcrumbs = useMemo(() => normalizeFileBrowserRouteState(
    routeState,
    storageId,
    requestedFolderId,
  ), [routeState, storageId, requestedFolderId]);
  const validFolderId = requestedFolderId === null
    || (isValidObjectId(requestedFolderId) && Boolean(routeBreadcrumbs));
  const folderId = validFolderId && storageId ? requestedFolderId : null;
  const breadcrumbs = routeBreadcrumbs ?? rootBreadcrumbs();
  const displayState = browserState.storageId === storageId && browserState.folderId === folderId
    ? browserState
    : EMPTY_BROWSER_STATE;

  useEffect(() => {
    if (!isFilesRoute || storageStatus !== 'ready' || !storageId) return;
    if (previousStorageIdRef.current !== null && previousStorageIdRef.current !== storageId) {
      listControllerRef.current?.abort();
      paginationControllerRef.current?.abort();
      createControllerRef.current?.abort();
      generationRef.current += 1;
      previousStorageIdRef.current = storageId;
      setNotice('Storage changed. Showing the storage root.');
      setSearchParams({}, { replace: true, state: routeStateFor(storageId, rootBreadcrumbs()) });
      return;
    }
    previousStorageIdRef.current = storageId;
  }, [isFilesRoute, storageStatus, storageId, setSearchParams]);

  useEffect(() => {
    if (!isFilesRoute || storageStatus !== 'ready' || !storageId || validFolderId) return;
    listControllerRef.current?.abort();
    paginationControllerRef.current?.abort();
    generationRef.current += 1;
    setNotice('That folder link could not be verified. Showing My Files.');
    setSearchParams({}, { replace: true, state: routeStateFor(
      storageId,
      rootBreadcrumbs(),
      'That folder link could not be verified. Showing My Files.',
    ) });
  }, [isFilesRoute, storageStatus, storageId, validFolderId, setSearchParams]);

  const loadFirstPage = useCallback(async ({ refreshing = false } = {}) => {
    if (!storageId || storageStatus !== 'ready') return false;
    listControllerRef.current?.abort();
    paginationControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = ++generationRef.current;
    const isCurrent = () => !controller.signal.aborted && generationRef.current === generation;
    if (refreshing) {
      setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
        ? { ...current, status: 'refreshing', error: null, paginationStatus: 'idle', paginationError: null }
        : current);
    }

    try {
      const page = await listStorageObjects(storageId, { parentId: folderId, limit: 50, signal: controller.signal });
      if (!isCurrent()) return false;
      setBrowserState({
        storageId,
        folderId,
        items: page.items,
        nextCursor: page.nextCursor,
        status: page.items.length === 0 ? 'empty' : 'ready',
        error: null,
        paginationStatus: 'idle',
        paginationError: null,
      });
      setNotice('');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      if (error instanceof StorageApiError && error.status === 401) {
        expireSession();
        return false;
      }
      if (error instanceof StorageApiError && error.status === 404 && folderId) {
        setNotice('That folder is no longer available. Showing My Files.');
        setSearchParams({}, { replace: true, state: routeStateFor(storageId, rootBreadcrumbs(), 'That folder is no longer available. Showing My Files.') });
        return false;
      }
      setBrowserState({
        storageId,
        folderId,
        items: [],
        nextCursor: null,
        status: 'error',
        error: error instanceof Error ? error.message : 'Storage is temporarily unavailable. Try again.',
        paginationStatus: 'idle',
        paginationError: null,
      });
      return false;
    }
  }, [storageId, storageStatus, folderId, expireSession, setSearchParams]);

  useEffect(() => {
    if (!isFilesRoute || storageStatus !== 'ready' || !storageId || !validFolderId) {
      listControllerRef.current?.abort();
      paginationControllerRef.current?.abort();
      createControllerRef.current?.abort();
      generationRef.current += 1;
      return undefined;
    }
    const scheduled = new AbortController();
    queueMicrotask(() => {
      if (!scheduled.signal.aborted) void loadFirstPage();
    });
    return () => {
      scheduled.abort();
      listControllerRef.current?.abort();
      paginationControllerRef.current?.abort();
      createControllerRef.current?.abort();
      generationRef.current += 1;
    };
  }, [isFilesRoute, storageStatus, storageId, validFolderId, folderId, loadFirstPage]);

  const navigateToBreadcrumb = useCallback((index) => {
    if (!storageId) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const nextFolderId = nextBreadcrumbs.at(-1)?.objectId ?? null;
    setNotice('');
    setSearchParams(nextFolderId ? { folder: nextFolderId } : {}, {
      state: routeStateFor(storageId, nextBreadcrumbs),
    });
  }, [storageId, breadcrumbs, setSearchParams]);

  const openFolder = useCallback((objectId) => {
    if (!storageId || !isValidObjectId(objectId)) return;
    const item = displayState.items.find((entry) => entry.objectId === objectId);
    if (!item || item.type !== 'folder') return;
    const nextBreadcrumbs = appendBreadcrumb(breadcrumbs, item);
    setNotice('');
    setSearchParams({ folder: objectId }, { state: routeStateFor(storageId, nextBreadcrumbs) });
  }, [storageId, displayState.items, breadcrumbs, setSearchParams]);

  const navigateRoot = useCallback(() => {
    if (!storageId) return;
    setNotice('');
    setSearchParams({}, { state: routeStateFor(storageId, rootBreadcrumbs()) });
  }, [storageId, setSearchParams]);

  const refreshCurrentFolder = useCallback(() => loadFirstPage({ refreshing: true }), [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!storageId || !displayState.nextCursor || displayState.paginationStatus === 'loading') return;
    paginationControllerRef.current?.abort();
    const controller = new AbortController();
    paginationControllerRef.current = controller;
    const generation = generationRef.current;
    const cursor = displayState.nextCursor;
    setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
      ? { ...current, paginationStatus: 'loading', paginationError: null }
      : current);
    try {
      const page = await listStorageObjects(storageId, { parentId: folderId, cursor, limit: 50, signal: controller.signal });
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
        ? { ...current, items: mergeStorageObjects(current.items, page.items), nextCursor: page.nextCursor,
          status: mergeStorageObjects(current.items, page.items).length === 0 ? 'empty' : 'ready', paginationStatus: 'idle', paginationError: null }
        : current);
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      if (error instanceof StorageApiError && error.status === 401) {
        expireSession();
        return;
      }
      if (error instanceof StorageApiError && error.status === 404 && folderId) {
        setNotice('That folder is no longer available. Showing My Files.');
        setSearchParams({}, { replace: true, state: routeStateFor(storageId, rootBreadcrumbs(), 'That folder is no longer available. Showing My Files.') });
        return;
      }
      setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
        ? { ...current, paginationStatus: 'error', paginationError: error instanceof Error ? error.message : 'Storage is temporarily unavailable. Try again.' }
        : current);
    }
  }, [storageId, folderId, displayState.nextCursor, displayState.paginationStatus, expireSession, setSearchParams]);

  const createFolder = useCallback(async (name) => {
    if (!storageId || !activeStorage || !capabilities?.createFolder || activeStorage.readOnly) {
      return { error: 'FORBIDDEN' };
    }
    if (typeof name !== 'string' || !name.trim()) return { error: 'INVALID_INPUT' };
    if (new TextEncoder().encode(name).length > 255 || [...name].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || (code >= 127 && code <= 159) || character === '/' || character === '\\';
    })) return { error: 'INVALID_INPUT' };
    if (displayState.items.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return { error: 'NAME_CONFLICT' };
    }

    createControllerRef.current?.abort();
    const controller = new AbortController();
    createControllerRef.current = controller;
    const generation = generationRef.current;
    setIsCreatingFolder(true);
    try {
      await createStorageFolder(storageId, { name, parentId: folderId }, { signal: controller.signal });
      if (controller.signal.aborted || generation !== generationRef.current) return { error: 'CANCELLED' };
      await loadFirstPage({ refreshing: true });
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return { error: 'CANCELLED' };
      if (error instanceof StorageApiError && error.status === 401) expireSession();
      return { error: error instanceof StorageApiError ? error.code : 'PROVIDER_UNAVAILABLE' };
    } finally {
      if (createControllerRef.current === controller) setIsCreatingFolder(false);
    }
  }, [storageId, activeStorage, capabilities, displayState.items, folderId, loadFirstPage, expireSession]);

  const value = useMemo(() => ({
    storageId,
    folderId,
    breadcrumbs,
    items: displayState.items,
    status: storageStatus === 'loading' ? 'loading' : storageStatus === 'empty' || storageStatus === 'unavailable' ? 'unavailable' : displayState.status,
    error: storageStatus === 'empty' ? 'No active storage is available for this account.' : storageStatus === 'unavailable' ? (storageError || 'Storage could not be reached. Check the connection and try again.') : displayState.error,
    nextCursor: displayState.nextCursor,
    paginationStatus: displayState.paginationStatus,
    paginationError: displayState.paginationError,
    notice: location.state?.fileBrowserNotice || notice,
    canCreateFolder: Boolean(capabilities?.createFolder && activeStorage && !activeStorage.readOnly),
    isCreatingFolder,
    openFolder,
    navigateToBreadcrumb,
    navigateRoot,
    refreshCurrentFolder,
    loadMore,
    createFolder,
  }), [storageId, folderId, breadcrumbs, displayState, storageStatus, location.state, notice,
    capabilities, activeStorage, storageError, isCreatingFolder, openFolder, navigateToBreadcrumb,
    navigateRoot, refreshCurrentFolder, loadMore, createFolder]);

  return value;
}

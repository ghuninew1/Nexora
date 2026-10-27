import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useStorage } from './useStorage';
import {
  copyStorageObject,
  canUseStorageCapability,
  createStorageFolder,
  listStorageObjects,
  mergeStorageObjects,
  moveStorageObject,
  renameStorageObject,
  startStorageObjectDownload,
  StorageApiError,
  uploadStorageFile,
  validateStorageObjectName,
} from '../services/storage';
import { appendBreadcrumb, isValidObjectId, normalizeFileBrowserRouteState, rootBreadcrumbs } from '../utils/storage-files';
import useUploadQueue from './useUploadQueue';

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

function operationErrorMessage(code) {
  if (code === 'NAME_CONFLICT') return 'A file or folder with this name already exists here.';
  if (code === 'INVALID_INPUT') return 'Check the name or destination and try again.';
  if (code === 'UPLOAD_TOO_LARGE') return 'This file is too large for the connected storage.';
  if (code === 'FORBIDDEN' || code === 'CAPABILITY_UNAVAILABLE') return 'You do not have permission to do that.';
  if (code === 'NOT_FOUND') return 'The file or destination folder is no longer available.';
  if (code === 'RATE_LIMITED') return 'Storage is temporarily busy. Try again shortly.';
  if (code === 'QUOTA_EXCEEDED') return 'The storage limit has been reached.';
  if (code === 'OPERATION_TOO_LARGE') return 'This folder contains too many items for a synchronous copy.';
  if (code === 'TRANSFER_INCOMPLETE') return 'The transfer did not complete. Try again.';
  return 'Storage is temporarily unavailable. Try again later.';
}

export default function useRemoteFilesState() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status: storageStatus, activeStorage, capabilities, error: storageError } = useStorage();
  const { expireSession } = useAuth();
  const [browserState, setBrowserState] = useState(EMPTY_BROWSER_STATE);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [mutatingIds, setMutatingIds] = useState(() => new Set());
  const [operationFeedback, setOperationFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const listControllerRef = useRef(null);
  const paginationControllerRef = useRef(null);
  const createControllerRef = useRef(null);
  const generationRef = useRef(0);
  const previousStorageIdRef = useRef(null);
  const currentListingRef = useRef(null);
  const loadFirstPageRef = useRef(null);
  const operationControllersRef = useRef(new Map());
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
  currentListingRef.current = { storageId, folderId, isFilesRoute };

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

  loadFirstPageRef.current = loadFirstPage;

  const refreshAfterUpload = useCallback((task) => {
    const current = currentListingRef.current;
    if (current?.isFilesRoute && current.storageId === task.storageId && current.folderId === task.parentId) {
      void loadFirstPageRef.current?.({ refreshing: true });
    }
  }, []);
  const uploadQueue = useUploadQueue({
    uploadFile: ({ file, storageId: targetStorageId, parentId, maxUploadBytes, signal }) => uploadStorageFile(
      targetStorageId,
      file,
      parentId,
      { maxUploadBytes, signal },
    ),
    onComplete: refreshAfterUpload,
    onUnauthorized: expireSession,
    maxConcurrency: 2,
  });
  const { addFiles, cancelUpload, retryUpload, clearFinished: clearFinishedUploads, cancelAll: cancelAllUploads } = uploadQueue;

  const canUseCapability = useCallback((name) => Boolean(
    storageStatus === 'ready'
    && activeStorage
    && canUseStorageCapability(capabilities, activeStorage, name),
  ), [storageStatus, activeStorage, capabilities]);

  const uploadFiles = useCallback((files) => {
    if (!canUseCapability('upload')) {
      setOperationFeedback({ type: 'error', message: 'Uploads are unavailable for this storage.' });
      return [];
    }
    setOperationFeedback(null);
    return addFiles(files, {
      storageId,
      parentId: folderId,
      maxUploadBytes: capabilities.maxUploadBytes ?? null,
    });
  }, [canUseCapability, addFiles, storageId, folderId, capabilities]);

  const runObjectOperation = useCallback(async ({ file, capability, refreshFolderId, successMessage, run }) => {
    if (!canUseCapability(capability)) return { error: 'FORBIDDEN' };
    if (operationControllersRef.current.has(file.objectId)) return { error: 'IN_PROGRESS' };
    const controller = new AbortController();
    operationControllersRef.current.set(file.objectId, controller);
    setMutatingIds((current) => new Set(current).add(file.objectId));
    setOperationFeedback(null);
    const operationStorageId = storageId;
    try {
      const result = await run(controller.signal);
      if (controller.signal.aborted) return { error: 'CANCELLED' };
      setOperationFeedback({ type: 'success', message: successMessage });
      const current = currentListingRef.current;
      if (current?.isFilesRoute && current.storageId === operationStorageId
        && current.folderId === refreshFolderId) {
        await loadFirstPageRef.current?.({ refreshing: true });
      }
      return { ok: true, result };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return { error: 'CANCELLED' };
      if (error instanceof StorageApiError && error.status === 401) expireSession();
      const code = error instanceof StorageApiError ? error.code : 'PROVIDER_UNAVAILABLE';
      setOperationFeedback({ type: 'error', message: operationErrorMessage(code) });
      return { error: code };
    } finally {
      if (operationControllersRef.current.get(file.objectId) === controller) {
        operationControllersRef.current.delete(file.objectId);
        setMutatingIds((current) => {
          const next = new Set(current);
          next.delete(file.objectId);
          return next;
        });
      }
    }
  }, [canUseCapability, storageId, expireSession]);

  const renameObject = useCallback((file, name) => {
    if (!validateStorageObjectName(name)) return Promise.resolve({ error: 'INVALID_INPUT' });
    return runObjectOperation({
      file,
      capability: 'rename',
      refreshFolderId: folderId,
      successMessage: 'Renamed successfully.',
      run: (signal) => renameStorageObject(storageId, file.objectId, name.trim(), { signal }),
    });
  }, [runObjectOperation, storageId, folderId]);

  const moveObject = useCallback((file, parentId) => runObjectOperation({
    file,
    capability: 'move',
    refreshFolderId: folderId,
    successMessage: 'Moved successfully.',
    run: (signal) => moveStorageObject(storageId, file.objectId, parentId, { signal }),
  }), [runObjectOperation, storageId, folderId]);

  const copyObject = useCallback((file, parentId) => runObjectOperation({
    file,
    capability: 'copy',
    refreshFolderId: parentId,
    successMessage: 'Copied successfully.',
    run: (signal) => copyStorageObject(storageId, file.objectId, parentId, { signal }),
  }), [runObjectOperation, storageId]);

  const downloadObject = useCallback((file) => runObjectOperation({
    file,
    capability: 'download',
    refreshFolderId: undefined,
    successMessage: `Downloading ${file.name}.`,
    run: (signal) => startStorageObjectDownload(storageId, file.objectId, { signal }),
  }), [runObjectOperation, storageId]);

  const operationStorageRef = useRef(storageId);
  useEffect(() => {
    if (operationStorageRef.current && storageId && operationStorageRef.current !== storageId) {
      cancelAllUploads();
      for (const controller of operationControllersRef.current.values()) controller.abort();
      operationControllersRef.current.clear();
      setMutatingIds(new Set());
    }
    operationStorageRef.current = storageId;
  }, [storageId, cancelAllUploads]);

  useEffect(() => () => {
    for (const controller of operationControllersRef.current.values()) controller.abort();
    operationControllersRef.current.clear();
  }, []);

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
    if (!storageId || !canUseCapability('createFolder')) {
      return { error: 'FORBIDDEN' };
    }
    if (!validateStorageObjectName(name)) return { error: 'INVALID_INPUT' };
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
  }, [storageId, canUseCapability, displayState.items, folderId, loadFirstPage, expireSession]);

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
    canCreateFolder: canUseCapability('createFolder'),
    canUpload: canUseCapability('upload'),
    canDownload: canUseCapability('download'),
    canRename: canUseCapability('rename'),
    canMove: canUseCapability('move'),
    canCopy: canUseCapability('copy'),
    isCreatingFolder,
    mutatingIds,
    operationFeedback,
    uploadQueue,
    uploadFiles,
    cancelUpload,
    retryUpload,
    clearFinishedUploads,
    renameObject,
    moveObject,
    copyObject,
    downloadObject,
    openFolder,
    navigateToBreadcrumb,
    navigateRoot,
    refreshCurrentFolder,
    loadMore,
    createFolder,
  }), [storageId, folderId, breadcrumbs, displayState, storageStatus, location.state, notice,
    storageError, canUseCapability, isCreatingFolder, mutatingIds,
    operationFeedback, uploadQueue, uploadFiles, cancelUpload, retryUpload, clearFinishedUploads,
    renameObject, moveObject, copyObject, downloadObject,
    openFolder, navigateToBreadcrumb, navigateRoot, refreshCurrentFolder, loadMore, createFolder]);

  return value;
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useStorage } from './useStorage';
import {
  copyStorageObject,
  canUseStorageCapability,
  createStorageFolder,
  fetchStorageObjectPreview,
  listStorageObjects,
  mergeStorageObjects,
  moveStorageObject,
  renameStorageObject,
  startStorageObjectDownload,
  StorageApiError,
  uploadStorageFile,
  validateStorageObjectName,
} from '../services/storage';
import { appendBreadcrumb, breadcrumbDestination, isValidObjectId, normalizeFileBrowserRouteState, rootBreadcrumbs } from '../utils/storage-files';
import useUploadQueue from './useUploadQueue';
import { RemoteFilesCache } from '../utils/remote-files-cache';
import { getStoragePreviewSpec, MAX_TEXT_PREVIEW_BYTES } from '../utils/storage-preview';
import { PreviewRequestCoordinator } from '../utils/preview-request';

const EMPTY_BROWSER_STATE = {
  storageId: null,
  folderId: null,
  items: [],
  nextCursor: null,
  status: 'loading',
  error: null,
  paginationStatus: 'idle',
  paginationError: null,
  revalidationError: null,
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
  const { expireSession, status: authStatus, user } = useAuth();
  const [browserState, setBrowserState] = useState(EMPTY_BROWSER_STATE);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [mutatingIds, setMutatingIds] = useState(() => new Set());
  const [operationFeedback, setOperationFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const createControllerRef = useRef(null);
  const generationRef = useRef(0);
  const previousStorageIdRef = useRef(null);
  const currentListingRef = useRef(null);
  const loadFirstPageRef = useRef(null);
  const operationControllersRef = useRef(new Map());
  const cacheRef = useRef(null);
  if (!cacheRef.current) cacheRef.current = new RemoteFilesCache();
  const previousCacheScopeRef = useRef({ storageId: null, userEmail: null, authStatus: null });
  const currentAuthScopeRef = useRef({ authStatus, userEmail: user?.email ?? null });
  const uploadRefreshTimerRef = useRef(null);
  const listingTimingRef = useRef(null);
  const previewCoordinatorRef = useRef(null);
  if (!previewCoordinatorRef.current) previewCoordinatorRef.current = new PreviewRequestCoordinator();
  const previewObjectUrlRef = useRef(null);
  currentAuthScopeRef.current = { authStatus, userEmail: user?.email ?? null };
  const requestedFolderId = searchParams.get('folder');
  const storageId = activeStorage?.storageId ?? null;
  const isFilesRoute = location.pathname === '/files';
  const routeState = location.state?.fileBrowser;
  const routeBreadcrumbs = useMemo(() => normalizeFileBrowserRouteState(
    routeState,
    storageId,
    requestedFolderId,
  ) ?? (storageId && requestedFolderId
    ? cacheRef.current.getBreadcrumbs(storageId, requestedFolderId, rootBreadcrumbs()[0])
    : null), [routeState, storageId, requestedFolderId]);
  const validFolderId = requestedFolderId === null
    || (isValidObjectId(requestedFolderId) && Boolean(routeBreadcrumbs));
  const folderId = validFolderId && storageId ? requestedFolderId : null;
  const breadcrumbs = routeBreadcrumbs ?? rootBreadcrumbs();
  const cachedListing = storageId ? cacheRef.current.get(storageId, folderId) : null;
  const displayState = useMemo(() => browserState.storageId === storageId && browserState.folderId === folderId
    && (cachedListing || ['loading', 'refreshing', 'error'].includes(browserState.status))
    ? browserState
    : cachedListing
      ? { ...EMPTY_BROWSER_STATE, storageId, folderId, items: cachedListing.items,
        nextCursor: cachedListing.nextCursor, status: cachedListing.items.length ? 'ready' : 'empty' }
      : EMPTY_BROWSER_STATE, [browserState, storageId, folderId, cachedListing]);
  currentListingRef.current = { storageId, folderId, isFilesRoute };

  useLayoutEffect(() => {
    const timing = listingTimingRef.current;
    if (!import.meta.env.DEV || !timing || timing.storageId !== browserState.storageId
      || timing.folderId !== browserState.folderId || !['ready', 'empty'].includes(browserState.status)) return;
    listingTimingRef.current = null;
    console.debug('[nexora:file-list]', {
      requestMs: Math.round(timing.requestMs),
      responseToCommitMs: Math.round(performance.now() - timing.responseAt),
      firstPage: true,
      itemCount: browserState.items.length,
    });
  }, [browserState]);

  useEffect(() => {
    const previous = previousCacheScopeRef.current;
    const nextUserEmail = authStatus === 'authenticated' ? user?.email ?? null : null;
    if (previous.authStatus !== null && (authStatus !== 'authenticated'
      || previous.userEmail !== nextUserEmail
      || (previous.storageId && storageId && previous.storageId !== storageId))) {
      cacheRef.current.clear();
      setBrowserState(EMPTY_BROWSER_STATE);
    }
    previousCacheScopeRef.current = { storageId, userEmail: nextUserEmail, authStatus };
  }, [authStatus, user?.email, storageId]);

  useEffect(() => () => {
    if (uploadRefreshTimerRef.current) clearTimeout(uploadRefreshTimerRef.current);
    previewCoordinatorRef.current.cancel();
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    cacheRef.current.clear();
  }, []);

  const closePreview = useCallback(() => {
    previewCoordinatorRef.current.cancel();
    setPreview(null);
  }, []);

  const openPreview = useCallback(async (file) => {
    previewCoordinatorRef.current.cancel();
    if (!file || file.type === 'folder') return;
    const spec = getStoragePreviewSpec(file);
    if (!(storageStatus === 'ready' && activeStorage
      && canUseStorageCapability(capabilities, activeStorage, 'download'))) {
      setPreview({ file, status: 'unsupported', message: 'Preview is not available for this file.' });
      return;
    }
    if (!spec) {
      setPreview({ file, status: 'unsupported', message: 'Preview is not available for this file.' });
      return;
    }
    if (Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > spec.maxBytes) {
      setPreview({ file, status: 'too-large', kind: spec.kind, message: spec.kind === 'text' ? 'Text previews are limited to 1 MiB.' : 'This file exceeds the preview size limit.' });
      return;
    }
    const request = previewCoordinatorRef.current.begin();
    setPreview({ file, status: 'loading', kind: spec.kind });
    try {
      const result = await fetchStorageObjectPreview(storageId, file, {
        signal: request.signal,
        maxBytes: spec.maxBytes,
        kind: spec.kind,
      });
      if (!previewCoordinatorRef.current.isCurrent(request)) return;
      if (result.blob.size > spec.maxBytes) {
        setPreview({ file, status: 'too-large', kind: spec.kind, message: spec.kind === 'text' ? 'Text previews are limited to 1 MiB.' : 'This file exceeds the preview size limit.' });
        return;
      }
      if (spec.kind === 'text') {
        const text = await result.blob.text();
        if (!previewCoordinatorRef.current.isCurrent(request)) return;
        let displayText = text;
        if (result.mimeType === 'application/json') {
          try { displayText = JSON.stringify(JSON.parse(text), null, 2); } catch { displayText = text; }
        }
        setPreview({ file, status: 'ready', kind: 'text', text: displayText, mimeType: result.mimeType });
        return;
      }
      const objectUrl = URL.createObjectURL(result.blob);
      previewObjectUrlRef.current = objectUrl;
      setPreview({ file, status: 'ready', kind: spec.kind, objectUrl, mimeType: result.mimeType });
    } catch (error) {
      if (!previewCoordinatorRef.current.isCurrent(request) || error?.name === 'AbortError') return;
      if (error instanceof StorageApiError && error.status === 401) {
        closePreview();
        expireSession();
        return;
      }
      const tooLarge = error instanceof StorageApiError && error.code === 'PREVIEW_TOO_LARGE';
      const unsupported = error instanceof StorageApiError && error.code === 'PREVIEW_UNSUPPORTED';
      setPreview({
        file,
        status: tooLarge ? 'too-large' : unsupported ? 'unsupported' : 'error',
        kind: spec.kind,
        message: tooLarge ? (spec.kind === 'text' ? 'Text previews are limited to 1 MiB.' : 'This file exceeds the preview size limit.')
          : unsupported ? 'Preview is not available for this file.'
            : 'Preview failed. Try again.',
      });
    }
  }, [storageId, storageStatus, activeStorage, capabilities, closePreview, expireSession]);

  useEffect(() => {
    if (!preview?.objectUrl) return undefined;
    previewObjectUrlRef.current = preview.objectUrl;
    return () => {
      URL.revokeObjectURL(preview.objectUrl);
      if (previewObjectUrlRef.current === preview.objectUrl) previewObjectUrlRef.current = null;
    };
  }, [preview?.objectUrl]);

  useEffect(() => {
    if (authStatus !== 'authenticated') closePreview();
  }, [authStatus, closePreview]);

  useEffect(() => {
    if (!isFilesRoute) closePreview();
  }, [isFilesRoute, closePreview]);

  useEffect(() => {
    closePreview();
  }, [storageId, folderId, closePreview]);

  useEffect(() => {
    if (!isFilesRoute || storageStatus !== 'ready' || !storageId) return;
    if (previousStorageIdRef.current !== null && previousStorageIdRef.current !== storageId) {
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
    generationRef.current += 1;
    setNotice('That folder link could not be verified. Showing My Files.');
    setSearchParams({}, { replace: true, state: routeStateFor(
      storageId,
      rootBreadcrumbs(),
      'That folder link could not be verified. Showing My Files.',
    ) });
  }, [isFilesRoute, storageStatus, storageId, validFolderId, setSearchParams]);

  const loadFirstPage = useCallback(async ({ refreshing = false, force = false } = {}) => {
    if (!storageId || storageStatus !== 'ready') return false;
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    const cached = cacheRef.current.get(storageId, folderId);
    if (cached && !force) {
      setBrowserState({
        storageId, folderId, items: cached.items, nextCursor: cached.nextCursor,
        status: cached.items.length ? (cacheRef.current.isFresh(cached) ? 'ready' : 'refreshing') : (cacheRef.current.isFresh(cached) ? 'empty' : 'refreshing'),
        error: null, paginationStatus: 'idle', paginationError: null, revalidationError: null,
      });
      if (cacheRef.current.isFresh(cached)) return true;
    } else if (refreshing || cached) {
      setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
        ? { ...current, status: 'refreshing', error: null, revalidationError: null,
          paginationStatus: 'idle', paginationError: null }
        : current);
    }

    try {
      const requestStartedAt = performance.now();
      const page = await cacheRef.current.fetchPage(storageId, folderId, null, (signal) => listStorageObjects(
        storageId, { parentId: folderId, limit: 50, signal },
      ));
      const responseAt = performance.now();
      if (!isCurrent()) return false;
      const result = cacheRef.current.get(storageId, folderId);
      listingTimingRef.current = { storageId, folderId, requestMs: responseAt - requestStartedAt, responseAt };
      setBrowserState({
        storageId,
        folderId,
        items: result?.items ?? page.items,
        nextCursor: result?.nextCursor ?? page.nextCursor,
        status: (result?.items ?? page.items).length === 0 ? 'empty' : 'ready',
        error: null,
        paginationStatus: 'idle',
        paginationError: null,
        revalidationError: null,
      });
      setNotice('');
      return true;
    } catch (error) {
      if (!isCurrent() || error?.name === 'AbortError') return false;
      if (error instanceof StorageApiError && error.status === 401) {
        cacheRef.current.clear();
        expireSession();
        return false;
      }
      if (error instanceof StorageApiError && error.status === 404 && folderId) {
        setNotice('That folder is no longer available. Showing My Files.');
        setSearchParams({}, { replace: true, state: routeStateFor(storageId, rootBreadcrumbs(), 'That folder is no longer available. Showing My Files.') });
        return false;
      }
      const stillCached = cacheRef.current.get(storageId, folderId);
      setBrowserState(stillCached ? {
        storageId, folderId, items: stillCached.items, nextCursor: stillCached.nextCursor,
        status: stillCached.items.length ? 'ready' : 'empty', error: null,
        paginationStatus: 'idle', paginationError: null,
        revalidationError: 'Could not refresh this folder. Showing saved results.',
      } : {
        storageId,
        folderId,
        items: [],
        nextCursor: null,
        status: 'error',
        error: error instanceof Error ? error.message : 'Storage is temporarily unavailable. Try again.',
        paginationStatus: 'idle',
        paginationError: null,
        revalidationError: null,
      });
      return false;
    }
  }, [storageId, storageStatus, folderId, expireSession, setSearchParams]);

  loadFirstPageRef.current = loadFirstPage;

  const refreshAfterUpload = useCallback((task, result) => {
    if (currentAuthScopeRef.current.authStatus !== 'authenticated') return;
    cacheRef.current.invalidate(task.storageId, task.parentId);
    if (result?.file) cacheRef.current.rememberObjects(task.storageId, [result.file]);
    const current = currentListingRef.current;
    if (current?.isFilesRoute && current.storageId === task.storageId && current.folderId === task.parentId) {
      setBrowserState((state) => state.storageId === task.storageId && state.folderId === task.parentId
        ? { ...state, status: 'refreshing', revalidationError: null }
        : state);
      if (uploadRefreshTimerRef.current) clearTimeout(uploadRefreshTimerRef.current);
      uploadRefreshTimerRef.current = setTimeout(() => {
        uploadRefreshTimerRef.current = null;
        void loadFirstPageRef.current?.({ refreshing: true, force: true });
      }, 120);
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

  const runObjectOperation = useCallback(async ({ file, capability, affectedFolders, successMessage, run, onResult }) => {
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
      for (const parentId of affectedFolders ?? []) cacheRef.current.invalidate(operationStorageId, parentId);
      onResult?.(result);
      setOperationFeedback({ type: 'success', message: successMessage });
      const current = currentListingRef.current;
      if (current?.isFilesRoute && current.storageId === operationStorageId
        && (affectedFolders ?? []).includes(current.folderId)) {
        await loadFirstPageRef.current?.({ refreshing: true, force: true });
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
      affectedFolders: [file.parentId ?? null],
      successMessage: 'Renamed successfully.',
      run: (signal) => renameStorageObject(storageId, file.objectId, name.trim(), { signal }),
      onResult: (object) => {
        cacheRef.current.rememberObjects(storageId, [object]);
        const current = location.state?.fileBrowser;
        if (current?.storageId === storageId && current.breadcrumbs?.some((item) => item.objectId === object.objectId)) {
          const next = { ...current, breadcrumbs: current.breadcrumbs.map((item) => item.objectId === object.objectId ? { ...item, label: object.name } : item) };
          setSearchParams(searchParams, { replace: true, state: { ...location.state, fileBrowser: next } });
        }
      },
    });
  }, [runObjectOperation, storageId, location.state, searchParams, setSearchParams]);

  const moveObject = useCallback((file, parentId) => runObjectOperation({
    file,
    capability: 'move',
    affectedFolders: [file.parentId ?? null, parentId ?? null],
    successMessage: 'Moved successfully.',
    run: (signal) => moveStorageObject(storageId, file.objectId, parentId, { signal }),
    onResult: (object) => cacheRef.current.rememberObjects(storageId, [object]),
  }), [runObjectOperation, storageId]);

  const copyObject = useCallback((file, parentId) => runObjectOperation({
    file,
    capability: 'copy',
    affectedFolders: [parentId ?? null],
    successMessage: 'Copied successfully.',
    run: (signal) => copyStorageObject(storageId, file.objectId, parentId, { signal }),
    onResult: (result) => cacheRef.current.rememberObjects(storageId, [result.object]),
  }), [runObjectOperation, storageId]);

  const downloadObject = useCallback((file) => runObjectOperation({
    file,
    capability: 'download',
    affectedFolders: [],
    successMessage: `Downloading ${file.name}.`,
    run: (signal) => startStorageObjectDownload(storageId, file.objectId, { signal }),
  }), [runObjectOperation, storageId]);

  const operationStorageRef = useRef(storageId);
  const operationAuthRef = useRef({ authStatus, userEmail: user?.email ?? null });
  useEffect(() => {
    const previousAuth = operationAuthRef.current;
    const userEmail = user?.email ?? null;
    if (previousAuth.authStatus === 'authenticated'
      && (authStatus !== 'authenticated' || previousAuth.userEmail !== userEmail)) {
      cancelAllUploads();
      createControllerRef.current?.abort();
      generationRef.current += 1;
      for (const controller of operationControllersRef.current.values()) controller.abort();
      operationControllersRef.current.clear();
      setMutatingIds(new Set());
      closePreview();
    }
    operationAuthRef.current = { authStatus, userEmail };
    if (operationStorageRef.current && storageId && operationStorageRef.current !== storageId) {
      cancelAllUploads();
      cacheRef.current.clear();
      closePreview();
      for (const controller of operationControllersRef.current.values()) controller.abort();
      operationControllersRef.current.clear();
      setMutatingIds(new Set());
    }
    operationStorageRef.current = storageId;
  }, [storageId, cancelAllUploads, authStatus, user?.email, closePreview]);

  useEffect(() => () => {
    for (const controller of operationControllersRef.current.values()) controller.abort();
    operationControllersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!isFilesRoute || storageStatus !== 'ready' || !storageId || !validFolderId) {
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
      createControllerRef.current?.abort();
      generationRef.current += 1;
    };
  }, [isFilesRoute, storageStatus, storageId, validFolderId, folderId, loadFirstPage]);

  const navigateToBreadcrumb = useCallback((objectId) => {
    if (!storageId) return;
    const destination = breadcrumbDestination(storageId, breadcrumbs, objectId);
    if (!destination) return;
    setNotice('');
    setSearchParams(destination.folderId ? { folder: destination.folderId } : {}, {
      state: destination.state,
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

  const refreshCurrentFolder = useCallback(() => loadFirstPage({ refreshing: true, force: true }), [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!storageId || !displayState.nextCursor || displayState.paginationStatus === 'loading') return;
    const generation = generationRef.current;
    const cursor = displayState.nextCursor;
    setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
      ? { ...current, paginationStatus: 'loading', paginationError: null }
      : current);
    try {
      const page = await cacheRef.current.fetchPage(storageId, folderId, cursor, (signal) => listStorageObjects(
        storageId, { parentId: folderId, cursor, limit: 50, signal },
      ));
      if (generation !== generationRef.current) return;
      const cached = cacheRef.current.get(storageId, folderId);
      setBrowserState((current) => current.storageId === storageId && current.folderId === folderId
        ? { ...current, items: cached?.items ?? mergeStorageObjects(current.items, page.items), nextCursor: cached?.nextCursor ?? page.nextCursor,
          status: (cached?.items ?? mergeStorageObjects(current.items, page.items)).length === 0 ? 'empty' : 'ready', paginationStatus: 'idle', paginationError: null }
        : current);
    } catch (error) {
      if (generation !== generationRef.current || error?.name === 'AbortError') return;
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
      cacheRef.current.invalidate(storageId, folderId);
      await loadFirstPage({ refreshing: true, force: true });
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
    revalidationError: displayState.revalidationError ?? null,
    notice: location.state?.fileBrowserNotice || notice,
    canCreateFolder: canUseCapability('createFolder'),
    canUpload: canUseCapability('upload'),
    canDownload: canUseCapability('download'),
    preview,
    canPreviewFile: (file) => Boolean(canUseCapability('download') && getStoragePreviewSpec(file)),
    openPreview,
    closePreview,
    maxTextPreviewBytes: MAX_TEXT_PREVIEW_BYTES,
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
    openFolder, navigateToBreadcrumb, navigateRoot, refreshCurrentFolder, loadMore, createFolder,
    preview, openPreview, closePreview]);

  return value;
}

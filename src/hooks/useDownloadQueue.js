import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createDownloadQueue, supportsManagedDownloads } from '../services/download-queue.js';
import { startStorageObjectDownload } from '../services/storage.js';

// One owner in useRemoteFilesState/FilesProvider, never in the Transfers dialog.
export default function useDownloadQueue({ scopeKey, allowed, rangeRead, onUnauthorized }) {
  const engine = useMemo(() => {
    // scopeKey deliberately creates an isolated engine on owner/mount teardown.
    void scopeKey;
    return createDownloadQueue({ nativeDownload: (storageId, objectId, options) => startStorageObjectDownload(storageId, objectId, options), onUnauthorized });
  }, [scopeKey, onUnauthorized]);
  const policy = useRef({ allowed, rangeRead });
  const items = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  useLayoutEffect(() => {
    engine.activate();
    const offline = () => engine.setOnline(false);
    const online = () => engine.setOnline(true);
    const hide = () => { void engine.dispose(); };
    const show = () => { engine.activate(); engine.setEnabled(policy.current.allowed, { rangeRead: policy.current.rangeRead }); };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); window.removeEventListener('offline', offline); window.removeEventListener('online', online); void engine.dispose(); };
  }, [engine]);
  useLayoutEffect(() => { policy.current = { allowed, rangeRead }; engine.setEnabled(allowed, { rangeRead }); }, [engine, allowed, rangeRead]);
  const startDownload = useCallback(file => engine.start(file, { managed: rangeRead === true && supportsManagedDownloads() }), [engine, rangeRead]);
  return useMemo(() => ({ items, startDownload, concurrency: engine.getConcurrency(), setConcurrency: engine.setConcurrency,
    pause: engine.pause, resume: engine.resume, retry: engine.resume, cancel: engine.cancel,
    clearFinished: engine.clearFinished, useNative: engine.useNative, canResume: allowed && rangeRead === true, canUseNative: allowed,
  }), [items, startDownload, engine, allowed, rangeRead]);
}

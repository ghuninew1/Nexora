import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { downloadFolderZip } from '../services/folder-download';

export default function useFolderDownload({ scopeKey, storageId, allowed, onUnauthorized }) {
  const [state, setState] = useState(null);
  const active = useRef(null);
  const lifecycle = useRef(null);
  useLayoutEffect(() => {
    const scope = { key: scopeKey, allowed, urls: new Map() };
    lifecycle.current = scope;
    return () => {
      lifecycle.current = null;
      active.current?.abort(); active.current = null;
      for (const [url, timer] of scope.urls) { clearTimeout(timer); URL.revokeObjectURL(url); }
    };
  }, [scopeKey, allowed]);
  const start = useCallback(async file => {
    const scope = lifecycle.current;
    if (!scope?.allowed || active.current || file.type !== 'folder' || (file.storageId && file.storageId !== storageId)) return;
    const controller = new AbortController(); active.current = controller;
    const current = () => lifecycle.current === scope && !controller.signal.aborted;
    setState({ scopeKey, stage: 'listing', name: file.name, transferred: 0, total: null });
    try {
      const result = await downloadFolderZip(storageId, file.objectId, { signal: controller.signal, onProgress: progress => {
        if (current()) setState({ scopeKey, ...progress });
      } });
      if (!current()) return;
      const url = URL.createObjectURL(result.blob);
      const timer = setTimeout(() => { URL.revokeObjectURL(url); scope.urls.delete(url); }, 60000);
      scope.urls.set(url, timer);
      const link = document.createElement('a'); link.href = url; link.download = result.name; document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setState({ scopeKey, stage: 'success', name: result.name, transferred: result.blob.size, message: 'ZIP prepared. Check your browser downloads.' });
    } catch (error) {
      if (lifecycle.current !== scope) return;
      if (error.status === 401) onUnauthorized?.();
      setState({ scopeKey, stage: controller.signal.aborted ? 'cancelled' : 'error', name: file.name,
        message: controller.signal.aborted ? 'Folder ZIP cancelled. No archive was saved.' : error.code
          ? 'Folder ZIP failed. Check your session, storage access and folder contents, then try again.' : error.message || 'Folder ZIP failed. Try again.' });
    } finally { if (active.current === controller) active.current = null; }
  }, [scopeKey, storageId, onUnauthorized]);
  const cancel = useCallback(() => active.current?.abort(), []);
  return { state: allowed && state?.scopeKey === scopeKey ? state : null, start, cancel };
}

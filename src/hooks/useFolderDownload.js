import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { downloadFolderZip, downloadSelectedZip } from '../services/folder-download';

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
    const selection = Array.isArray(file) ? file : [file];
    if (!scope?.allowed || active.current || !selection.length || (!Array.isArray(file) && file?.type !== 'folder')
      || selection.some(item => !item || !['file', 'folder'].includes(item.type) || (item.storageId && item.storageId !== storageId))) return;
    const summary = { selectedCount: selection.length, selectedFiles: selection.filter(item => item.type === 'file').length,
      selectedFolders: selection.filter(item => item.type === 'folder').length };
    const name = Array.isArray(file) ? 'Selected-Files.zip' : file.name;
    const controller = new AbortController(); active.current = controller;
    const current = () => lifecycle.current === scope && !controller.signal.aborted;
    setState({ scopeKey, ...summary, stage: 'listing', name, discoveredEntries: 0, transferred: 0, total: null });
    try {
      const download = Array.isArray(file) ? downloadSelectedZip : downloadFolderZip;
      const result = await download(storageId, Array.isArray(file) ? selection.map(item => item.objectId) : file.objectId, { signal: controller.signal, onProgress: progress => {
        if (current()) setState({ scopeKey, ...summary, ...progress });
      } });
      if (!current()) return;
      const url = URL.createObjectURL(result.blob);
      const timer = setTimeout(() => { URL.revokeObjectURL(url); scope.urls.delete(url); }, 60000);
      scope.urls.set(url, timer);
      const link = document.createElement('a'); link.href = url; link.download = result.name; document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setState({ scopeKey, ...summary, stage: 'success', name: result.name, transferred: result.bytes, total: result.bytes, discoveredEntries: result.discoveredEntries, message: 'ZIP prepared. Check your browser downloads.' });
    } catch (error) {
      if (lifecycle.current !== scope) return;
      if (error.status === 401) onUnauthorized?.();
      setState(previous => ({ ...previous, scopeKey, ...summary, stage: controller.signal.aborted ? 'cancelled' : 'error', name,
        message: controller.signal.aborted ? 'Folder ZIP cancelled. No archive was saved.' : error.code
          ? 'Folder ZIP failed. Check your session, storage access and folder contents, then try again.' : error.message || 'Folder ZIP failed. Try again.' }));
    } finally { if (active.current === controller) active.current = null; }
  }, [scopeKey, storageId, onUnauthorized]);
  const cancel = useCallback(() => active.current?.abort(), []);
  return { state: allowed && state?.scopeKey === scopeKey ? state : null, start, cancel };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, Folder } from 'lucide-react';
import { Button } from '../components/ui/button';
import StorageFilePreviewDialog from '../components/files/StorageFilePreviewDialog';
import { fetchPublicPreview, getPublicShare, listPublicObjects, parseShareCapability, publicObjectUrl, SHARE_UNAVAILABLE } from '../services/shares';
import { getStoragePreviewSpec, MAX_TEXT_PREVIEW_BYTES } from '../utils/storage-preview';
import { cx } from '../utils/cx';
import logo from '../assets/logo.avif';

function PublicContent({ capability }) {
  const [state, setState] = useState({ status: 'loading', root: null, items: [], nextCursor: null, download: false });
  const [path, setPath] = useState([]);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('');
  const previewRequest = useRef(null);
  const previewUrl = useRef(null);
  const pageRequest = useRef(null);
  const parentId = path.at(-1)?.objectId;
  const closePreview = () => { previewRequest.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPreview(null); };
  useEffect(() => {
    const c = new AbortController(); pageRequest.current = c;
    queueMicrotask(() => { if (!c.signal.aborted) setState(s => ({ ...s, status: 'loading', items: [], nextCursor: null })); });
    async function load() {
      try {
        const metadata = await getPublicShare(capability, { signal: c.signal });
        const page = metadata.object.type === 'folder' ? await listPublicObjects(capability, { parentId, signal: c.signal }) : { items: [], nextCursor: null };
        if (!c.signal.aborted) setState({ status: 'ready', root: metadata.object, download: metadata.download, ...page });
      } catch { if (!c.signal.aborted) setState({ status: 'unavailable', root: null, items: [], nextCursor: null }); }
    }
    void load();
    return () => { c.abort(); pageRequest.current?.abort(); previewRequest.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, [capability, parentId]);
  async function more() {
    if (state.status !== 'ready') return;
    const c = new AbortController(); pageRequest.current = c;
    setState(s => ({ ...s, status: 'more' }));
    try {
      const p = await listPublicObjects(capability, { parentId, cursor: state.nextCursor, signal: c.signal });
      if (!c.signal.aborted) setState(s => ({ ...s, status: 'ready', items: [...new Map([...s.items, ...p.items].map(v => [v.objectId, v])).values()], nextCursor: p.nextCursor }));
    } catch { if (!c.signal.aborted) { setState(s => ({ ...s, status: 'ready' })); setNotice(SHARE_UNAVAILABLE); } }
  }
  async function openPreview(file) {
    closePreview(); const c = new AbortController(); previewRequest.current = c;
    setPreview({ status: 'loading', file });
    try {
      const p = await fetchPublicPreview(capability, file, { signal: c.signal });
      const text = p.kind === 'text' ? await p.blob.text() : null;
      if (c.signal.aborted) return;
      const objectUrl = p.kind === 'text' ? null : URL.createObjectURL(p.blob); previewUrl.current = objectUrl;
      setPreview({ status: 'ready', file, text, objectUrl, kind: p.kind, mimeType: p.mimeType });
    } catch { if (!c.signal.aborted) setPreview({ status: 'error', file, message: SHARE_UNAVAILABLE }); }
  }
  function download(file) {
    const a = document.createElement('a'); a.href = publicObjectUrl(capability, file.objectId); a.referrerPolicy = 'no-referrer'; a.download = ''; document.body.append(a); a.click(); a.remove();
  }
  function actions(file) { return <div className={cx('flex shrink-0 flex-wrap gap-2')}>
    {state.download && getStoragePreviewSpec(file) && <Button className={cx("min-h-11")} variant="outline" onClick={() => void openPreview(file)}><Eye data-icon="inline-start" />Preview</Button>}
    {state.download && <Button className={cx("min-h-11")} onClick={() => download(file)}><Download data-icon="inline-start" />Download</Button>}
  </div>; }
  if (state.status === 'loading') return <p role="status" aria-live="polite">Loading shared item…</p>;
  if (state.status === 'unavailable') return <p role="alert">{SHARE_UNAVAILABLE}</p>;
  return <>
    <header className={cx('glass-surface min-w-0 p-5')}><h1 className={cx('break-words text-2xl font-semibold [overflow-wrap:anywhere]')}>{state.root.name}</h1><p className={cx('my-3 text-sm text-muted-foreground')}>{state.root.type === 'folder' ? 'Shared folder' : `Shared file · ${state.root.sizeBytes === null ? 'Size not reported' : `${state.root.sizeBytes.toLocaleString()} bytes`}`} · View + Download</p>{state.root.type === 'file' && actions(state.root)}</header>
    {state.root.type === 'folder' && <>
      <nav aria-label="Shared folder breadcrumb" className={cx('flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]')}><Button variant="ghost" className={cx('h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-all')} onClick={() => { closePreview(); setPath([]); }}>{state.root.name}</Button>{path.map((f, i) => <Button key={f.objectId} variant="ghost" className={cx('h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-all')} onClick={() => { closePreview(); setPath(path.slice(0, i + 1)); }}>/ {f.name}</Button>)}</nav>
      {state.items.length === 0 && <p role="status">This folder is empty.</p>}
      {state.items.map(file => <article key={file.objectId} className={cx('glass-surface flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between')}>
        <div className={cx('min-w-0 flex-1')}>{file.type === 'folder' ? <Button variant="ghost" className={cx('h-auto min-h-11 max-w-full whitespace-normal break-all text-left')} onClick={() => { closePreview(); setPath([...path, file]); }}><Folder data-icon="inline-start" />{file.name}</Button> : <><h2 className={cx('break-words font-medium [overflow-wrap:anywhere]')}>{file.name}</h2><p className={cx('mt-1 text-xs text-muted-foreground')}>{file.sizeBytes === null ? 'Size not reported' : `${file.sizeBytes.toLocaleString()} bytes`}</p></>}</div>{file.type === 'file' && actions(file)}
      </article>)}
      {state.nextCursor && <Button variant="outline" onClick={() => void more()} disabled={state.status === 'more'}>{state.status === 'more' ? 'Loading…' : 'Load more'}</Button>}
    </>}
    {notice && <p role="alert">{notice}</p>}
    <StorageFilePreviewDialog preview={preview} onOpenChange={open => { if (!open) closePreview(); }} onDownload={download} maxTextPreviewBytes={MAX_TEXT_PREVIEW_BYTES} />
  </>;
}
export default function PublicSharePage() {
  const { shareId, secret } = useParams();
  // Component key owns the complete public lifecycle and prevents capability state crossing routes.
  const capability = useMemo(() => parseShareCapability(shareId, secret), [shareId, secret]);
  useEffect(() => {
    document.title = 'Shared item — Nexora';
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.append(meta);
    return () => meta.remove();
  }, []);
  return <main className={cx('min-h-dvh min-w-0 bg-background p-4 text-foreground sm:p-8')}><div className={cx('mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-5')}><div className={cx('flex items-center gap-2 text-lg font-semibold')}><img src={logo} alt="" className={cx("size-7 object-contain")} />Nexora</div>{capability ? <PublicContent key={`${shareId}:${secret}`} capability={capability} /> : <p role="alert">{SHARE_UNAVAILABLE}</p>}</div></main>;
}

import { useState } from 'react';
import { usePreferences } from '../../hooks/usePreferences';
import { Button } from '../ui/button';
import { cx } from '../../utils/cx';
import { useStorage } from '../../hooks/useStorage';

function UploadForm({ preferences, save }) {
  const { storages, status: storageStatus, activeStorage } = useStorage();
  const [autoClear, setAutoClear] = useState(preferences.autoClearUploads);
  const [fileSort, setFileSort] = useState(preferences.fileSort);
  const [direction, setDirection] = useState(preferences.fileSortDirection);
  const [shareExpiration, setShareExpiration] = useState(preferences.shareExpiration);
  const [confirmDelete, setConfirmDelete] = useState(preferences.confirmDelete);
  const [defaultStorageId, setDefaultStorageId] = useState(preferences.defaultStorageId ?? '');
  const [state, setState] = useState('idle');
  async function submit(event) {
    event.preventDefault(); setState('saving');
    try { await save({ autoClearUploads: autoClear, fileSort, fileSortDirection: direction, shareExpiration, confirmDelete, ...(defaultStorageId !== (preferences.defaultStorageId ?? '') ? { defaultStorageId: defaultStorageId || null } : {}) }); setState('saved'); }
    catch { setState('error'); }
  }
  return <form onSubmit={submit} className={cx('glass-surface flex flex-col items-start gap-4 p-5')}>
    <div><h2 className={cx('font-semibold')}>Uploads</h2><p className={cx('mt-1 text-sm text-muted-foreground')}>Uploads run one at a time in each tab. Choose when completed uploads are cleared.</p></div>
    <label className={cx('flex flex-col gap-2 text-sm')}>Default file sort<select className={cx('glass-control min-h-11 rounded-lg px-3')} value={fileSort} disabled={state === 'saving'} onChange={event => setFileSort(event.target.value)}><option value="name">Name</option><option value="modified">Modified</option><option value="size">Size</option><option value="type">Type</option></select></label>
    <label className={cx('flex flex-col gap-2 text-sm')}>Default sort direction<select className={cx('glass-control min-h-11 rounded-lg px-3')} value={direction} disabled={state === 'saving'} onChange={event => setDirection(event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    <label className={cx('flex flex-col gap-2 text-sm')}>Default public link expiration<select className={cx('glass-control min-h-11 rounded-lg px-3')} value={shareExpiration} disabled={state === 'saving'} onChange={event => setShareExpiration(event.target.value)}><option value="never">Never</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>
    <label className={cx('flex flex-col gap-2 text-sm')}>Default storage<select className={cx('glass-control min-h-11 rounded-lg px-3')} value={defaultStorageId} disabled={state === 'saving' || storageStatus === 'loading' || storageStatus === 'unavailable'} onChange={event => setDefaultStorageId(event.target.value)}><option value="">First available</option>{defaultStorageId && !storages.some(storage => storage.storageId === defaultStorageId && storage.status === 'active') && <option value={defaultStorageId} disabled>Previously selected storage unavailable</option>}{storages.filter(storage => storage.status === 'active').map(storage => <option key={storage.storageId} value={storage.storageId}>{storage.name}</option>)}</select><span className={cx('text-xs text-muted-foreground')}>{storageStatus === 'loading' ? 'Loading storages…' : storageStatus === 'unavailable' ? 'Storage is unavailable.' : `Current: ${activeStorage?.name ?? 'None'}`}</span></label>
    <label className={cx('flex min-h-11 items-center gap-2 text-sm')}><input type="checkbox" checked={autoClear} disabled={state === 'saving'} onChange={event => setAutoClear(event.target.checked)} />Automatically clear completed uploads</label>
    <label className={cx('flex min-h-11 items-center gap-2 text-sm')}><input type="checkbox" checked={confirmDelete} disabled={state === 'saving'} onChange={event => setConfirmDelete(event.target.checked)} />Confirm before moving an item to Trash</label>
    <label className={cx('flex flex-col gap-2 text-sm')}>Duplicate upload behavior<select className={cx('glass-control min-h-11 rounded-lg px-3')} value="ask" disabled><option value="ask">Report conflict</option><option value="rename" disabled>Rename — unavailable</option><option value="replace" disabled>Replace — unavailable</option></select><span className={cx('text-xs text-muted-foreground')}>Automatic rename and replace are not supported safely by this storage integration.</span></label>
    {state === 'saved' && <p role="status">Preferences saved.</p>}{state === 'error' && <p role="alert">Unable to save preferences. Try again.</p>}
    <Button type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save preferences'}</Button>
  </form>;
}
export default function UploadPreferences() {
  const { preferences, status, load, save } = usePreferences();
  if (status === 'loading') return <p role="status">Loading upload preferences…</p>;
  if (status === 'error' || !preferences) return <div role="alert" className={cx('glass-surface flex flex-wrap items-center gap-3 p-5')}>Unable to load preferences.<Button variant="outline" onClick={() => void load()}>Try again</Button></div>;
  return <UploadForm preferences={preferences} save={save} />;
}

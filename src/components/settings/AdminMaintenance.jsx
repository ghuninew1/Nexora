import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';

export default function AdminMaintenance() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('loading');
  const [feedback, setFeedback] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/settings', { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(({ data }) => { setSettings(data); setMessage(data.maintenanceMessage); setStatus('ready'); })
      .catch(() => { if (!controller.signal.aborted) { setStatus('error'); setFeedback('Unable to load administration settings.'); } });
    return () => controller.abort();
  }, []);

  async function save(update) {
    setStatus('saving'); setFeedback('');
    try {
      const response = await fetch('/api/admin/settings', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      if (!response.ok) throw new Error();
      const { data } = await response.json();
      setSettings(data); setMessage(data.maintenanceMessage); setFeedback('Saved.');
      window.dispatchEvent(new Event('nexora:config-change'));
    } catch { setFeedback('Could not save. Check your connection and try again.'); }
    finally { setStatus('ready'); setConfirmOpen(false); }
  }

  return <section className={cx('glass-surface flex flex-col gap-4 p-5')}>
    <div><h2 className={cx('text-base font-semibold')}>Administration · System</h2><p className={cx('mt-1 text-sm text-muted-foreground')}>Maintenance keeps file and share changes read-only for users. Administrators retain access.</p></div>
    {status === 'loading' && <p role="status">Loading administration settings…</p>}
    {feedback && <p role={status === 'error' || feedback.startsWith('Could not') ? 'alert' : 'status'}>{feedback}</p>}
    {settings && <>
      <label className={cx('flex flex-col gap-2 text-sm font-medium')}>Maintenance message
        <input className={cx('glass-control min-h-11 rounded-lg px-3 font-normal')} maxLength={300} value={message} disabled={status === 'saving'} onChange={event => setMessage(event.target.value)} />
      </label>
      <div className={cx('flex flex-wrap gap-2')}>
        <Button type="button" variant="outline" disabled={status === 'saving' || !message.trim() || message.trim() === settings.maintenanceMessage} onClick={() => void save({ maintenanceMessage: message })}>Save message</Button>
        <Button type="button" disabled={status === 'saving'} onClick={() => setConfirmOpen(true)}>{settings.maintenanceMode ? 'Disable maintenance' : 'Enable maintenance'}</Button>
      </div>
      <p className={cx('text-sm text-muted-foreground')}>Status: {settings.maintenanceMode ? 'On' : 'Off'}{status === 'saving' ? ' · Saving…' : ''}</p>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent>
        <DialogHeader><DialogTitle>{settings.maintenanceMode ? 'Disable maintenance?' : 'Enable maintenance?'}</DialogTitle><DialogDescription>{settings.maintenanceMode ? 'Users will be able to change files and public links again.' : 'Users can still read files, but file and public-link changes will be blocked. Administrators remain able to make changes.'}</DialogDescription></DialogHeader>
        <DialogFooter><Button type="button" variant="outline" disabled={status === 'saving'} onClick={() => setConfirmOpen(false)}>Cancel</Button><Button type="button" disabled={status === 'saving'} onClick={() => void save({ maintenanceMode: !settings.maintenanceMode })}>Confirm</Button></DialogFooter>
      </DialogContent></Dialog>
    </>}
  </section>;
}

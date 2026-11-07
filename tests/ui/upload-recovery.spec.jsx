import { memoryWebLocks } from '../helpers/web-locks';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor, render, screen, fireEvent } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import useUploadQueue from '../../src/hooks/useUploadQueue';
import UploadQueue from '../../src/components/files/UploadQueue';
import { createMultipartUploadClient } from '../../src/services/multipart-upload';
import { createUploadRecoveryStore } from '../../src/services/upload-recovery';
import { memoryIndexedDB } from '../helpers/memory-indexeddb';

beforeEach(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: memoryWebLocks() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const record = (patch = {}) => ({schemaVersion:1,id:'record_a',userScope:'owner_a',transferId:'transfer_a',idempotencyKey:'stable_key',
  storageId:'storage_a',parentId:null,name:'original.bin',sizeBytes:10,mimeType:'application/octet-stream',lastModified:123,
  partSizeBytes:8*1024**2,partCount:1,createdAt:1000,expiresAt:Date.now()+100000,updatedAt:2000,lastState:'paused',intent:'pause',...patch});
function fixture(patch={}) {
  const database=memoryIndexedDB(),store=createUploadRecoveryStore({indexedDB:database});
  const session={transferId:'transfer_a',state:'paused',version:1,sizeBytes:10,partSizeBytes:8*1024**2,partCount:1,
    expiresAt:Date.now()+100000,acknowledgedBytes:0,parts:[],nextCursor:null,...patch};
  const client={getCompletedParts:vi.fn(async()=>({...session,parts:[...session.parts]})),
    reconcile:vi.fn(async()=>({...session,parts:[...session.parts]})),
    createSession:vi.fn(async()=>({...session})),
    resumeSession:vi.fn(async()=>{session.state='active';return {...session};}),
    uploadPart:vi.fn(async()=>{session.parts=[{partNumber:1,sizeBytes:10,sha256:'verified'}];session.acknowledgedBytes=10;return session.parts[0];}),
    completeSession:vi.fn(async()=>{session.state='completed';session.object={objectId:'logical_file'};return {...session};}),
    cancelSession:vi.fn(async()=>{session.state='cancelled';return {transferId:'transfer_a',state:'cancelled'};})};
  const options={scopeKey:'a:storage_a',recoveryScope:'owner_a',recoveryStorageId:'storage_a',recoveryStore:store,
    createClient:vi.fn(()=>client),autoClear:false,onComplete:vi.fn(),onUnauthorized:vi.fn()};
  return {database,store,session,client,options};
}
const source=(patch={})=>Object.assign(new File(['abcdefghij'],'original.bin',{type:'application/octet-stream',lastModified:123}),patch);
const state=h=>h.result.current.items[0]?.status;

it('restores after authentication only, with no File and no session creation or upload',async()=>{
  const f=fixture();await f.store.save(record());
  const h=renderHook(options=>useUploadQueue(options),{initialProps:{...f.options,recoveryScope:null}});
  await act(async()=>{});expect(f.options.createClient).not.toHaveBeenCalled();
  h.rerender(f.options);await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  expect(f.client.getCompletedParts).toHaveBeenCalledWith('transfer_a');
  expect(f.client.createSession).not.toHaveBeenCalled();expect(f.client.uploadPart).not.toHaveBeenCalled();
  expect(h.result.current.items[0].needsFile).toBe(true);
});

it('refresh/reopen retains the same logical identity and key; select validates before explicit Resume',async()=>{
  const f=fixture();await f.store.save(record());
  const first=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(first)).toBe('waiting_file'));
  first.unmount();
  const reopenedStore=createUploadRecoveryStore({indexedDB:f.database});
  const h=renderHook(()=>useUploadQueue({...f.options,recoveryStore:reopenedStore}));
  await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.selectOriginalFile('record_a',source()));
  await waitFor(()=>expect(state(h)).toBe('paused'));
  expect(f.client.reconcile).toHaveBeenCalledWith('transfer_a',expect.any(File));
  expect(f.client.uploadPart).not.toHaveBeenCalled();
  act(()=>h.result.current.resumeUpload('record_a'));
  await waitFor(()=>expect(state(h)).toBe('success'));
  expect(f.client.createSession).not.toHaveBeenCalled();expect(f.options.onComplete).toHaveBeenCalledTimes(1);
  await waitFor(async()=>expect(await reopenedStore.list('owner_a','storage_a')).toEqual([]));
});

it('rejects metadata and acknowledged digest mismatches without altering the server session',async()=>{
  const f=fixture();await f.store.save(record());const h=renderHook(()=>useUploadQueue(f.options));
  await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.selectOriginalFile('record_a',new File(['abcdefghij'],'wrong.bin',{lastModified:123})));
  expect(state(h)).toBe('file_mismatch');expect(f.client.reconcile).not.toHaveBeenCalled();
  f.client.reconcile.mockRejectedValueOnce(Object.assign(new Error(),{code:'FILE_MISMATCH'}));
  act(()=>h.result.current.selectOriginalFile('record_a',source()));
  await waitFor(()=>expect(state(h)).toBe('file_mismatch'));
  expect(f.client.resumeSession).not.toHaveBeenCalled();expect(f.client.cancelSession).not.toHaveBeenCalled();
  expect((await f.store.list('owner_a','storage_a'))[0].transferId).toBe('transfer_a');
  expect(f.session.state).toBe('paused');
});

it('restored completed/cancelled/expired sessions follow server truth and remove local metadata',async()=>{
  for(const terminal of ['completed','cancelled','expired']) {
    const f=fixture({state:terminal,object:{objectId:'existing_file'}});await f.store.save(record());
    const h=renderHook(()=>useUploadQueue(f.options));
    await waitFor(()=>expect(state(h)).toBe(terminal==='completed'?'success':terminal));
    await waitFor(async()=>expect(await f.store.list('owner_a','storage_a')).toEqual([]));
    expect(f.client.createSession).not.toHaveBeenCalled();expect(f.client.completeSession).not.toHaveBeenCalled();
    expect(f.options.onComplete).toHaveBeenCalledTimes(terminal==='completed'?1:0);
    h.unmount();
  }
});

it('server unavailability/inaccessible sessions retain metadata and support explicit reconciliation retry',async()=>{
  const f=fixture();await f.store.save(record());
  f.client.getCompletedParts.mockRejectedValueOnce(Object.assign(new Error(),{code:'NETWORK_INTERRUPTION'}));
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('recovery_error'));
  expect(f.client.getCompletedParts).toHaveBeenCalledTimes(1);expect((await f.store.list('owner_a','storage_a')).length).toBe(1);
  act(()=>h.result.current.retryReconciliation('record_a'));await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  f.client.getCompletedParts.mockRejectedValueOnce(Object.assign(new Error(),{code:'SESSION_UNAVAILABLE'}));
  act(()=>h.result.current.retryReconciliation('record_a'));await waitFor(()=>expect(state(h)).toBe('recovery_error'));
  expect((await f.store.list('owner_a','storage_a')).length).toBe(1);
});

it('pending cancellation cannot revive through reselection or Resume',async()=>{
  const f=fixture({state:'active'});await f.store.save(record({intent:'cancel',lastState:'cancelling'}));
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('error'));
  act(()=>{h.result.current.selectOriginalFile('record_a',source());h.result.current.resumeUpload('record_a');});
  expect(f.client.reconcile).not.toHaveBeenCalled();expect(f.client.uploadPart).not.toHaveBeenCalled();
  act(()=>h.result.current.retryUpload('record_a'));await waitFor(()=>expect(state(h)).toBe('cancelled'));
  expect(f.client.cancelSession).toHaveBeenCalledWith('transfer_a');
});

it('unknown create identity is never replayed during startup and keeps its stable key for explicit recovery',async()=>{
  const f=fixture({state:'active'});await f.store.save(record({transferId:null,lastState:'uploading',intent:null}));
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  expect(f.client.createSession).not.toHaveBeenCalled();
  act(()=>h.result.current.cancelUpload('record_a'));await waitFor(()=>expect(state(h)).toBe('cancelled'));
  expect(f.client.createSession.mock.calls[0][1]).toBe('stable_key');
  expect(f.client.cancelSession).toHaveBeenCalledWith('transfer_a');
});

it('stale IDB/server responses never cross owner scopes; duplicate restores are suppressed',async()=>{
  const f=fixture();let finishOld;
  const slow={...f.store,list:vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValue([])};
  const h=renderHook(options=>useUploadQueue(options),{initialProps:{...f.options,recoveryStore:slow}});
  await waitFor(()=>expect(slow.list).toHaveBeenCalledTimes(1));
  h.rerender({...f.options,recoveryStore:slow,scopeKey:'b:storage_a',recoveryScope:'owner_b'});
  await act(async()=>finishOld([record()]));
  expect(h.result.current.items).toEqual([]);expect(f.options.createClient).not.toHaveBeenCalled();h.unmount();
  const duplicates={...f.store,list:vi.fn().mockResolvedValue([record(),record(),record({id:'duplicate_id'})])};
  const reopened=renderHook(()=>useUploadQueue({...f.options,recoveryStore:duplicates}),{wrapper:StrictMode});
  await waitFor(()=>expect(state(reopened)).toBe('waiting_file'));
  expect(reopened.result.current.items).toHaveLength(1);expect(f.client.getCompletedParts).toHaveBeenCalledTimes(1);
});

it('clearing local history removes only local owner records and never cancels server sessions',async()=>{
  const f=fixture();await f.store.save(record());await f.store.save(record({userScope:'owner_b'}));
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.clearLocalHistory());expect(h.result.current.items).toEqual([]);
  await waitFor(async()=>expect(await f.store.list('owner_a','storage_a')).toEqual([]));
  expect((await f.store.list('owner_b','storage_a')).length).toBe(1);expect(f.client.cancelSession).not.toHaveBeenCalled();
});

it('quota/unavailable persistence is visible and does not break legacy uploads',async()=>{
  const f=fixture();f.database.failOpen=true;
  const upload=vi.fn().mockResolvedValue({file:{objectId:'legacy'}});
  const h=renderHook(()=>useUploadQueue({...f.options,uploadFile:upload}));
  await waitFor(()=>expect(h.result.current.persistenceWarning).toContain('unavailable'));
  act(()=>h.result.current.addFiles([source()],{storageId:'storage_a',maxUploadBytes:10}));
  await waitFor(()=>expect(state(h)).toBe('success'));expect(upload).toHaveBeenCalledTimes(1);
  expect(f.client.createSession).not.toHaveBeenCalled();
});

it('reselected acknowledged bytes use real SHA-256 and upload only verified missing parts',async()=>{
  vi.stubGlobal('Blob',NodeBlob);
  const partSize=8*1024**2, bytes=new Uint8Array(partSize+2);
  const original=new NodeFile([bytes],'original.bin',{type:'application/octet-stream',lastModified:123});
  const wrongBytes=bytes.slice();wrongBytes[0]=1;
  const wrong=new NodeFile([wrongBytes],'original.bin',{type:'application/octet-stream',lastModified:123});
  const f=fixture();await f.store.save(record({sizeBytes:bytes.length,partCount:2}));
  const session={...f.session,sizeBytes:bytes.length,partCount:2,acknowledgedBytes:partSize,
    parts:[{partNumber:1,sizeBytes:partSize,sha256:createHash('sha256').update(bytes.subarray(0,partSize)).digest('base64')}]};
  const writes=[];
  const fetchImpl=vi.fn(async(url,init)=>{
    if(init.method==='PUT'){
      writes.push(url);const body=new Uint8Array(await init.body.arrayBuffer());
      expect(body.length).toBe(2);expect(init.headers['X-Part-SHA256']).toBe(createHash('sha256').update(body).digest('base64'));
      const receipt={partNumber:2,sizeBytes:2,sha256:init.headers['X-Part-SHA256']};
      session.parts.push(receipt);session.acknowledgedBytes=bytes.length;return Response.json({data:receipt});
    }
    if(url.endsWith('/resume'))session.state='active';
    if(url.endsWith('/complete')){session.state='completed';session.object={objectId:'existing_logical_file',name:'original.bin',parentId:null,type:'file',sizeBytes:bytes.length};}
    if(init.method==='POST')writes.push(url);
    return Response.json({data:session});
  });
  const h=renderHook(()=>useUploadQueue({...f.options,createClient:options=>createMultipartUploadClient({...options,fetchImpl,cryptoImpl:webcrypto})}));
  await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.selectOriginalFile('record_a',wrong));await waitFor(()=>expect(state(h)).toBe('file_mismatch'));
  expect(writes).toEqual([]);
  act(()=>h.result.current.selectOriginalFile('record_a',original));await waitFor(()=>expect(state(h)).toBe('paused'));
  expect(writes).toEqual([]);
  act(()=>h.result.current.resumeUpload('record_a'));await waitFor(()=>expect(state(h)).toBe('success'));
  expect(writes.filter(url=>url.includes('/parts/'))).toEqual(['/api/storage/v1/storages/storage_a/uploads/transfer_a/parts/2']);
  expect(writes.filter(url=>url.endsWith('/uploads'))).toEqual([]);
});

it('UI exposes original-file selection, reconciliation retry and local-only history clearing',()=>{
  const select=vi.fn(),retry=vi.fn(),clear=vi.fn();
  render(<UploadQueue items={[{id:'a',name:'original.bin',sizeBytes:10,strategy:'multipart',status:'waiting_file',needsFile:true},
    {id:'b',name:'offline.bin',sizeBytes:10,strategy:'multipart',status:'recovery_error',needsFile:true}]} concurrency={2}
    onSelectOriginal={select} onRetryReconciliation={retry} onClearLocalHistory={clear} />);
  fireEvent.change(screen.getByLabelText('Original file for original.bin'),{target:{files:[source()]}});
  expect(select).toHaveBeenCalledWith('a',expect.any(File));
  fireEvent.click(screen.getByRole('button',{name:'Retry reconciliation offline.bin'}));expect(retry).toHaveBeenCalledWith('b');
  fireEvent.click(screen.getByRole('button',{name:'Clear local history'}));expect(clear).toHaveBeenCalledTimes(1);
});

it('quota failure leaves multipart usable in memory and does not keep enqueuing failed writes',async()=>{
  const f=fixture();
  const failing={...f.store,save:vi.fn().mockRejectedValue(Object.assign(new Error(),{name:'QuotaExceededError'}))};
  const h=renderHook(()=>useUploadQueue({...f.options,recoveryStore:failing}));
  await act(async()=>{});
  act(()=>h.result.current.addFiles([source()],{storageId:'storage_a',maxUploadBytes:4,
    transfers:{resumableUpload:true,maxFileBytes:10*1024**3,partSizeBytes:8*1024**2,maxParts:1280,maxParallelParts:1,sessionTtlSeconds:604800}}));
  await waitFor(()=>expect(state(h)).toBe('paused'));
  expect(h.result.current.persistenceWarning).toContain('could not be saved');
  expect(f.client.createSession).toHaveBeenCalledTimes(1);
  const writes=failing.save.mock.calls.length;
  act(()=>h.result.current.resumeUpload(h.result.current.items[0].id));
  await waitFor(()=>expect(state(h)).toBe('success'));
  expect(failing.save).toHaveBeenCalledTimes(writes);
});

it('commits the create key before the first POST and the logical ID before part scheduling',async()=>{
  const f=fixture({state:'active'});
  f.client.createSession.mockImplementation(async(metadata,key)=>{
    const stored=await f.store.list('owner_a','storage_a');
    expect(stored).toHaveLength(1);expect(stored[0].transferId).toBeNull();expect(stored[0].idempotencyKey).toBe(key);
    return {...f.session};
  });
  f.client.reconcile.mockImplementation(async()=>{
    expect((await f.store.list('owner_a','storage_a'))[0].transferId).toBe('transfer_a');
    return {...f.session,parts:[...f.session.parts]};
  });
  const h=renderHook(()=>useUploadQueue(f.options));await act(async()=>{});
  act(()=>h.result.current.addFiles([source()],{storageId:'storage_a',maxUploadBytes:4,
    transfers:{resumableUpload:true,maxFileBytes:10*1024**3,partSizeBytes:8*1024**2,maxParts:1280,maxParallelParts:1,sessionTtlSeconds:604800}}));
  await waitFor(()=>expect(state(h)).toBe('success'));
});

it('late restored server completion cannot change a new account or remove its records',async()=>{
  const f=fixture();await f.store.save(record());let finish;
  f.client.getCompletedParts.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const h=renderHook(options=>useUploadQueue(options),{initialProps:f.options});
  await waitFor(()=>expect(f.client.getCompletedParts).toHaveBeenCalledTimes(1));
  h.rerender({...f.options,scopeKey:'b:storage_a',recoveryScope:'owner_b'});
  await act(async()=>finish({...f.session,state:'completed',object:{objectId:'old_owner_file'}}));
  expect(h.result.current.items).toEqual([]);expect(f.options.onComplete).not.toHaveBeenCalled();
  expect((await f.store.list('owner_a','storage_a')).length).toBe(1);
});

it('duplicate pending creation keys restore once without startup POST',async()=>{
  const f=fixture();
  const store={...f.store,list:vi.fn().mockResolvedValue([record({id:'one',transferId:null}),record({id:'two',transferId:null})]),remove:vi.fn().mockResolvedValue()};
  const h=renderHook(()=>useUploadQueue({...f.options,recoveryStore:store}));
  await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  expect(h.result.current.items).toHaveLength(1);expect(f.client.createSession).not.toHaveBeenCalled();
  expect(store.remove).toHaveBeenCalledWith('owner_a','two');
});

it('failed local deletion remains visible after clearing UI history',async()=>{
  const f=fixture();await f.store.save(record());
  const store={...f.store,remove:vi.fn().mockRejectedValue(new Error('IDB unavailable'))};
  const h=renderHook(()=>useUploadQueue({...f.options,recoveryStore:store}));
  await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.clearLocalHistory());
  await waitFor(()=>expect(h.result.current.persistenceWarning).toContain('may reappear'));
  expect(h.result.current.items).toEqual([]);expect(f.client.cancelSession).not.toHaveBeenCalled();
});

it('digest mismatch discovered after unknown-create recovery still allows safe reselection',async()=>{
  const f=fixture({state:'active'});await f.store.save(record({transferId:null,intent:null}));
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('waiting_file'));
  act(()=>h.result.current.selectOriginalFile('record_a',source()));await waitFor(()=>expect(state(h)).toBe('paused'));
  f.client.reconcile.mockRejectedValueOnce(Object.assign(new Error(),{code:'FILE_MISMATCH'}));
  act(()=>h.result.current.resumeUpload('record_a'));await waitFor(()=>expect(state(h)).toBe('file_mismatch'));
  expect(h.result.current.items[0].needsFile).toBe(true);expect(f.client.cancelSession).not.toHaveBeenCalled();
  expect((await f.store.list('owner_a','storage_a'))[0].transferId).toBe('transfer_a');
  act(()=>h.result.current.selectOriginalFile('record_a',source()));await waitFor(()=>expect(state(h)).toBe('paused'));
  act(()=>h.result.current.resumeUpload('record_a'));await waitFor(()=>expect(state(h)).toBe('success'));
  expect(f.client.createSession).toHaveBeenCalledTimes(1);
});

it('stale reconciliation actions cannot reinsert completed history or replay completion callbacks',async()=>{
  const f=fixture({state:'completed',object:{objectId:'existing'}});await f.store.save(record());
  const h=renderHook(()=>useUploadQueue(f.options));await waitFor(()=>expect(state(h)).toBe('success'));
  await waitFor(async()=>expect(await f.store.list('owner_a','storage_a')).toEqual([]));
  act(()=>h.result.current.retryReconciliation('record_a'));
  expect(state(h)).toBe('success');expect(f.client.getCompletedParts).toHaveBeenCalledTimes(1);
  expect(f.options.onComplete).toHaveBeenCalledTimes(1);
});

it('two tabs serialize the same session and reconcile takeover after owner unmount without cancellation', async () => {
  const f = fixture({ state: 'active' }); await f.store.save(record({ intent: null, lastState: 'uploading' }));
  const first = renderHook(() => useUploadQueue(f.options));
  await waitFor(() => expect(state(first)).toBe('waiting_file'));
  act(() => first.result.current.selectOriginalFile('record_a', source()));
  await waitFor(() => expect(state(first)).toBe('paused'));
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  f.client.uploadPart.mockImplementation(() => { started(); return new Promise(() => {}); });
  // A real HTTP client settles when aborted. Keep the old result pending here to
  // prove no takeover until the operation has actually settled.
  let settle;
  f.client.uploadPart.mockImplementation(() => { started(); return new Promise(resolve => { settle = resolve; }); });
  act(() => first.result.current.resumeUpload('record_a')); await entered;
  const second = renderHook(() => useUploadQueue(f.options));
  await waitFor(() => expect(state(second)).toBe('other_tab'));
  const reads = f.client.getCompletedParts.mock.calls.length;
  first.unmount();
  await act(async () => {}); expect(state(second)).toBe('other_tab');
  await act(async () => settle({ partNumber: 1 }));
  await waitFor(() => expect(state(second)).toBe('waiting_file'));
  expect(f.client.getCompletedParts.mock.calls.length).toBeGreaterThan(reads);
  expect(f.client.cancelSession).not.toHaveBeenCalled();
  expect(f.client.uploadPart).toHaveBeenCalledTimes(1);
  expect(f.options.onComplete).not.toHaveBeenCalled();
});

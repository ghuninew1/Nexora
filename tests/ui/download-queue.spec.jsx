import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RemoteFilesContext } from '../../src/context/files-context';
import DownloadQueue from '../../src/components/files/DownloadQueue';
import TransferManager from '../../src/components/files/TransferManager';
import useDownloadQueue from '../../src/hooks/useDownloadQueue';
import { AuthProvider } from '../../src/context/AuthProvider';
import { useAuth } from '../../src/hooks/useAuth';
import { ReadableStream } from 'node:stream/web';
const mocks=vi.hoisted(()=>({me:vi.fn(),signOut:vi.fn()}));
vi.mock('../../src/services/auth',()=>({getCurrentUser:mocks.me,signOut:mocks.signOut,signIn:vi.fn(),updateDisplayName:vi.fn()}));
const tag='"'+'a'.repeat(64)+'"';
let writer,signal,picker;
beforeEach(()=>{
  writer={write:vi.fn().mockResolvedValue(),truncate:vi.fn().mockResolvedValue(),close:vi.fn().mockResolvedValue(),abort:vi.fn().mockResolvedValue()};
  picker=vi.fn().mockResolvedValue({createWritable:vi.fn().mockResolvedValue(writer),isSameEntry:vi.fn().mockResolvedValue(false)});
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('showSaveFilePicker',picker);vi.stubGlobal('ReadableStream',ReadableStream);
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    signal=init.signal;
    return {status:200,headers:new Headers({'Content-Length':'10',ETag:tag,'Accept-Ranges':'bytes'}),body:init.method==='HEAD'?null:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));}})};
  }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function useQueue(props={}) { return useDownloadQueue({scopeKey:'owner-a:mount',allowed:true,rangeRead:true,onUnauthorized:undefined,...props}); }
it('hook owns one queue in StrictMode; unmount and account/scope changes abort disk and network', async()=>{
  const h=renderHook(props=>useQueue(props),{initialProps:{scopeKey:'a:mount'},wrapper:StrictMode});
  await act(async()=>{await h.result.current.startDownload({storageId:'mount',objectId:'object',name:'a.bin',sizeBytes:10});});
  await waitFor(()=>expect(writer.write).toHaveBeenCalledTimes(1));
  const previous=signal;
  h.rerender({scopeKey:'b:mount'});
  await waitFor(()=>expect(writer.abort).toHaveBeenCalledTimes(1));expect(previous.aborted).toBe(true);expect(h.result.current.items).toEqual([]);
  expect(writer.close).not.toHaveBeenCalled();h.unmount();
});
it('logout initiation clears active downloads while server logout is still pending',async()=>{
  mocks.me.mockResolvedValue({id:'owner-a',email:'owner@test'});let finish;
  mocks.signOut.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const h=renderHook(()=>{
    const auth=useAuth();const queue=useQueue({scopeKey:JSON.stringify([auth.status,auth.user?.id,auth.signingOut]),allowed:auth.status==='authenticated'&&!auth.signingOut});return{auth,queue};
  },{wrapper:AuthProvider});
  await waitFor(()=>expect(h.result.current.auth.status).toBe('authenticated'));
  await act(async()=>{await h.result.current.queue.startDownload({storageId:'mount',objectId:'object',name:'a.bin'});});
  await waitFor(()=>expect(writer.write).toHaveBeenCalledTimes(1));const previous=signal;
  let logout;act(()=>{logout=h.result.current.auth.logout();});expect(previous.aborted).toBe(true);expect(h.result.current.queue.items).toEqual([]);
  await act(async()=>{finish();await logout;});expect(writer.close).not.toHaveBeenCalled();
});
it('pagehide drops active-page tasks and pageshow permits a fresh task without recovery',async()=>{
  const h=renderHook(()=>useQueue());
  await act(async()=>{await h.result.current.startDownload({storageId:'mount',objectId:'object',name:'a.bin'});});
  await waitFor(()=>expect(writer.write).toHaveBeenCalledTimes(1));const previous=signal;
  act(()=>window.dispatchEvent(new Event('pagehide')));expect(previous.aborted).toBe(true);expect(h.result.current.items).toEqual([]);
  act(()=>window.dispatchEvent(new Event('pageshow')));
  await act(async()=>{await h.result.current.startDownload({storageId:'mount',objectId:'other',name:'b.bin'});});
  await waitFor(()=>expect(picker).toHaveBeenCalledTimes(2));
});
it('network listeners preserve explicit pause and never create duplicate resume workers',async()=>{
  const h=renderHook(()=>useQueue());await act(async()=>{await h.result.current.startDownload({storageId:'mount',objectId:'object',name:'a.bin'});});
  await waitFor(()=>expect(writer.write).toHaveBeenCalledTimes(1));const id=h.result.current.items[0].id;
  act(()=>h.result.current.pause(id));await waitFor(()=>expect(h.result.current.items[0].status).toBe('paused'));
  const count=fetch.mock.calls.length;
  act(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));});
  expect(fetch.mock.calls.length).toBe(count);expect(h.result.current.items[0].status).toBe('paused');
});
it('unified dialog shows separate budgets and controls, verified progress and honest native fallback',()=>{
  const downloads={items:[
    {id:'d1',name:'disk.bin',sizeBytes:100,writtenBytes:100,status:'finalizing',busy:true},
    {id:'d2',name:'paused.bin',sizeBytes:100,writtenBytes:30,status:'paused',busy:false},
    {id:'d3',name:'native.bin',sizeBytes:100,writtenBytes:0,status:'native',native:true},
    {id:'d4',name:'failed.bin',sizeBytes:100,writtenBytes:0,status:'error',retryable:true,restartRequired:true,error:'Version changed.'},
    {id:'d5',name:'active.bin',sizeBytes:100,writtenBytes:50,status:'downloading',bytesPerSecond:10,etaSeconds:5},
  ],concurrency:2,canResume:true,pause:vi.fn(),resume:vi.fn(),retry:vi.fn(),cancel:vi.fn(),clearFinished:vi.fn(),setConcurrency:vi.fn(),useNative:vi.fn()};
  const uploads={items:[{id:'u',name:'upload.bin',status:'uploading',strategy:'legacy',sizeBytes:1}],concurrency:3,cancelUpload:vi.fn()};
  render(<MemoryRouter><RemoteFilesContext.Provider value={{uploadQueue:uploads,downloadQueue:downloads}}><TransferManager/></RemoteFilesContext.Provider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:/Transfers, 4 active/}));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getAllByRole('region',{name:'Upload queue'})).toHaveLength(1);expect(screen.getAllByRole('region',{name:'Download queue'})).toHaveLength(1);
  expect(screen.getByRole('progressbar',{name:'Downloading disk.bin'}).getAttribute('aria-valuenow')).toBe('99');
  expect(screen.queryByRole('progressbar',{name:'Downloading native.bin'})).toBeNull();expect(screen.getByText(/Your browser controls progress/)).toBeTruthy();
  expect(screen.getByText(/10 B\/s · ETA about 5s/)).toBeTruthy();expect(screen.getByText(/30 B verified written · 70 B remaining/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Resume download paused.bin'}));expect(downloads.resume).toHaveBeenCalledWith('d2');
  fireEvent.click(screen.getByRole('button',{name:'Retry download failed.bin'}));expect(downloads.retry).toHaveBeenCalledWith('d4');
  fireEvent.click(screen.getByRole('button',{name:'Pause download active.bin'}));expect(downloads.pause).toHaveBeenCalledWith('d5');
  fireEvent.click(screen.getByRole('button',{name:'Cancel download active.bin'}));expect(downloads.cancel).toHaveBeenCalledWith('d5');
  fireEvent.click(screen.getByRole('button',{name:'Use browser download failed.bin'}));expect(downloads.useNative).toHaveBeenCalledWith('d4');
  fireEvent.change(screen.getByRole('combobox',{name:'Download concurrency'}),{target:{value:'5'}});expect(downloads.setConcurrency).toHaveBeenCalledWith(5);expect(uploads.concurrency).toBe(3);
  fireEvent.click(screen.getByRole('button',{name:'Clear finished downloads'}));expect(downloads.clearFinished).toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'Cancel download disk.bin'})).toBeNull();
});

it('restored download exposes explicit Recover, destination warning, cancellation and native alternative',()=>{
  const queue={items:[{id:'saved',name:'saved.bin',sizeBytes:100,writtenBytes:30,status:'paused',recoverable:true,recoveryWarning:'Destination metadata unavailable.'}],
    concurrency:2,canResume:true,canUseNative:true,resume:vi.fn(),cancel:vi.fn(),useNative:vi.fn(),setConcurrency:vi.fn()};
  render(<DownloadQueue queue={queue}/>);
  expect(queue.resume).not.toHaveBeenCalled();
  expect(screen.getByText(/30 B saved checkpoint \(unverified\)/)).toBeTruthy();
  expect(screen.getByText(/Recovery requires destination permission/)).toBeTruthy();
  expect(screen.getByText('Destination metadata unavailable.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Recover download saved.bin'}));expect(queue.resume).toHaveBeenCalledWith('saved');
  fireEvent.click(screen.getByRole('button',{name:'Cancel download saved.bin'}));expect(queue.cancel).toHaveBeenCalledWith('saved');
  fireEvent.click(screen.getByRole('button',{name:'Use browser download saved.bin'}));expect(queue.useNative).toHaveBeenCalledWith('saved');
});
it('unavailable durable storage and unsupported capability are explicit in Downloads',()=>{
  render(<DownloadQueue queue={{items:[],concurrency:2,supportsRecovery:false,recoveryWarning:'Saved downloads could not be read.'}}/>);
  expect(screen.getByRole('alert').textContent).toBe('Saved downloads could not be read.');
  expect(screen.getByText(/Durable recovery is unavailable in this browser/)).toBeTruthy();
});

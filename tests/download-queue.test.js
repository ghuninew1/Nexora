import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadQueue, supportsManagedDownloads } from '../src/services/download-queue.js';
const tag = '"' + 'a'.repeat(64) + '"';
const nextTag = '"' + 'b'.repeat(64) + '"';
const encoder = new TextEncoder();
const file = { storageId: 'mount-test', objectId: 'object-test', name: 'example.txt', type: 'file', sizeBytes: 10 };
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
async function until(check) { for (let i=0;i<1500;i++) { if(check()) return; await tick(); } assert.fail('timed out waiting for test state'); }
function deferred() { let resolve;const promise = new Promise(r=>{resolve=r;});return {promise,resolve}; }
function destination({ onWrite, close, writeFailure = false } = {}) {
  const state = { committed: 'original', temp: [], writes: [], aborted: 0, closed: 0, opened: 0 };
  const handle = { async isSameEntry(other) {return other===handle;}, async createWritable(options) {
    assert.equal(options.keepExistingData,false);assert.equal(options.mode,'exclusive');state.opened++;state.temp=[];
    return {
      async write({type,position,data}) {assert.equal(type,'write');state.writes.push({position,length:data.length});await onWrite?.(position,data);if(writeFailure)throw Error('private disk path');for(let i=0;i<data.length;i++)state.temp[position+i]=data[i];},
      async truncate(size) { state.temp.length=size; },
      async close() { await close?.();state.closed++;state.committed=new TextDecoder().decode(new Uint8Array(state.temp)); },
      async abort() {state.aborted++;state.temp=[];},
    };
  } };
  return { handle, state };
}
function fixture(options = {}) {
  const dest = options.destination || destination();
  const calls = [], natives = [];
  let version=tag, text='0123456789', gets=0, picks=0, clock=0;
  const metaHeaders=()=>({'Content-Length':String(text.length),ETag:version,'Accept-Ranges':'bytes'});
  const defaultGet=(init)=>{
    const start=init.headers.Range ? Number(/^bytes=(\d+)-$/u.exec(init.headers.Range)[1]) : 0;
    assert.equal(init.headers['If-Range'],start?version:undefined);
    const status=start?start===text.length?416:206:200;
    const bytes=text.slice(start);
    return new Response(status===416?null:bytes,{status,headers:{...metaHeaders(),'Content-Length':String(bytes.length),
      ...(status===206?{'Content-Range':`bytes ${start}-${text.length-1}/${text.length}`} : status===416?{'Content-Range':`bytes */${text.length}`} : {})}});
  };
  const queue=createDownloadQueue({
    fetchImpl:async(url,init)=>{
      calls.push({url,init});assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
      assert.match(url,/^\/api\/storage\/v1\/storages\/mount-test\/objects\//u);
      if(init.method==='HEAD')return options.head?options.head(init):new Response(null,{headers:metaHeaders()});
      gets++;return options.get?options.get(init,gets,defaultGet):defaultGet(init);
    },
    pickFile:options.pickFile || (()=>{picks++;return dest.handle;}),
    nativeDownload:async(...args)=>{natives.push(args);return options.nativeDownload?.(...args);},
    onUnauthorized:options.onUnauthorized,
    now:()=>{clock+=101;return clock;},random:()=>0,
    concurrency:options.concurrency || 2, ...options.queue,
  });
  queue.setEnabled(true,{rangeRead:true});
  return { queue, calls, natives, dest, get picks(){return picks;}, get gets(){return gets;}, change(value='abcdefghij'){version=nextTag;text=value;},
    async start(input=file){await queue.start(input);return queue.getSnapshot().at(-1).id;},
    async done(id,status='success'){await until(()=>queue.getSnapshot().find(i=>i.id===id)?.status===status && !queue.getSnapshot().find(i=>i.id===id)?.busy);return queue.getSnapshot().find(i=>i.id===id);},
  };
}
function stalledGet(init) {
  assert.equal(init.method,'GET');
  return new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('012'));}}),{headers:{'Content-Length':'10',ETag:tag,'Accept-Ranges':'bytes'}});
}
test('full stream writes directly, exact offsets, and reports100 only after disk close', async () => {
  const gate=deferred(), dest=destination({close:()=>gate.promise});
  const f=fixture({destination:dest});const id=await f.start();
  await until(()=>f.queue.getSnapshot()[0]?.status==='finalizing');
  assert.equal(f.queue.getSnapshot()[0].writtenBytes,10);assert.equal(dest.state.committed,'original');
  assert.equal(f.queue.getSnapshot()[0].status,'finalizing');gate.resolve();
  assert.equal((await f.done(id)).writtenBytes,10);assert.equal(dest.state.committed,'0123456789');
  assert.deepEqual(dest.state.writes,[{position:0,length:10}]);assert.equal(f.calls[0].init.method,'HEAD');
  await f.queue.dispose();
});
test('received network bytes never become written progress before the disk acknowledges', async () => {
  const gate=deferred(), f=fixture({destination:destination({onWrite:()=>gate.promise})});const id=await f.start();
  await until(()=>f.dest.state.writes.length===1);
  const before=f.queue.getSnapshot()[0];assert.equal(before.receivedBytes,10);assert.equal(before.writtenBytes,0);
  f.queue.pause(id);gate.resolve();await f.done(id,'paused');assert.equal(f.queue.getSnapshot()[0].writtenBytes,10);
  assert.equal(f.dest.state.committed,'original');await f.queue.dispose();
});
test('Pause waits for the in-flight write, then resumes with verified Range and If-Range', async () => {
  const gate=deferred();const f=fixture({destination:destination({onWrite:pos=>pos===0?gate.promise:undefined}),get:(init,n,normal)=>n===1?stalledGet(init):normal(init)});
  const id=await f.start();await until(()=>f.dest.state.writes.length===1);f.queue.pause(id);
  assert.equal(f.queue.getSnapshot()[0].status,'pausing');assert.equal(f.calls.length,2);
  gate.resolve();const paused=await f.done(id,'paused');assert.equal(paused.writtenBytes,3);
  f.queue.setOnline(false);f.queue.setOnline(true);await tick();assert.equal(f.gets,1);
  f.queue.resume(id);await f.done(id);assert.equal(f.calls.at(-1).init.headers.Range,'bytes=3-');
  assert.equal(f.calls.at(-1).init.headers['If-Range'],tag);assert.equal(f.dest.state.committed,'0123456789');assert.equal(f.dest.state.opened,1);
  await f.queue.dispose();
});
test('Cancel discards the temporary file, leaves the existing destination intact; Retry chooses anew', async () => {
  const f=fixture({get:(init,n,normal)=>n===1?stalledGet(init):normal(init)});const id=await f.start();
  await until(()=>f.dest.state.writes.length>0);await f.queue.cancel(id);await f.done(id,'cancelled');
  assert.equal(f.dest.state.committed,'original');assert.equal(f.dest.state.aborted,1);assert.equal(f.queue.getSnapshot()[0].writtenBytes,0);
  await f.queue.resume(id);await f.done(id);assert.equal(f.picks,2);assert.equal(f.calls.at(-1).init.headers.Range,undefined);await f.queue.dispose();
});
test('truncation resumes with bounded retries and exact byte output', async () => {
  const f=fixture({get:(init,n,normal)=>n===1?new Response('012',{headers:{'Content-Length':'10',ETag:tag,'Accept-Ranges':'bytes'}}):normal(init)});
  const id=await f.start();await f.done(id);assert.equal(f.gets,2);assert.equal(f.calls.at(-1).init.headers.Range,'bytes=3-');assert.equal(f.dest.state.committed,'0123456789');await f.queue.dispose();
});
test('repeated network failures exhaust two automatic attempts; manual Retry is explicit', async () => {
  const f=fixture({get:()=>{throw new TypeError('private host');}});const id=await f.start();const error=await f.done(id,'error');
  assert.equal(f.gets,3);assert.equal(error.errorCode,'NETWORK_INTERRUPTION');assert.ok(!error.error.includes('private'));
  await f.queue.cancel(id);await f.queue.clearFinished();assert.deepEqual(f.queue.getSnapshot(),[]);await f.queue.dispose();
});
test('offline stops scheduling and recovers only active intent, never explicit Pause or Cancel', async () => {
  const f=fixture({get:(init,n,normal)=>n===1?stalledGet(init):normal(init)});const id=await f.start();await until(()=>f.dest.state.writes.length>0);
  f.queue.setOnline(false);await f.done(id,'waiting_network');assert.equal(f.gets,1);
  f.queue.setOnline(true);await f.done(id);assert.equal(f.dest.state.committed,'0123456789');await f.queue.dispose();
  const paused=fixture();paused.queue.setOnline(false);const pid=await paused.start();assert.equal(paused.gets,0);
  paused.queue.pause(pid);paused.queue.setOnline(true);await tick();assert.equal(paused.gets,0);await paused.queue.cancel(pid);paused.queue.setOnline(false);paused.queue.setOnline(true);await tick();assert.equal(paused.gets,0);await paused.queue.dispose();
});
test('changed HEAD metadata discards partial bytes and needs explicit restart', async () => {
  const f=fixture({get:(init,n,normal)=>n===1?stalledGet(init):normal(init)});const id=await f.start();await until(()=>f.dest.state.writes.length>0);f.queue.pause(id);await f.done(id,'paused');f.change();f.queue.resume(id);
  const error=await f.done(id,'error');assert.equal(error.errorCode,'FILE_CHANGED');assert.equal(error.writtenBytes,0);assert.equal(f.gets,1);assert.equal(f.dest.state.committed,'original');
  f.queue.resume(id);await f.done(id);assert.equal(f.dest.state.committed,'abcdefghij');await f.queue.dispose();
});
test('unexpected200, changed GET ETag, wrong206 geometry and416 never append to partial bytes', async () => {
  for(const scenario of ['200','tag','geometry','416']) {
    const f=fixture({get:(init,n)=>n===1?stalledGet(init):new Response(scenario==='416'?null:'3456789',{status:scenario==='416'?416:scenario==='200'?200:206,headers:{
      ETag:scenario==='tag'?nextTag:tag,'Accept-Ranges':'bytes','Content-Length':scenario==='416'?'0':'7',
      ...(scenario==='416'?{'Content-Range':'bytes */10'}:scenario==='200'?{}:{'Content-Range':scenario==='geometry'?'bytes 4-9/10':'bytes 3-9/10'}),
    }})});
    const id=await f.start();await until(()=>f.dest.state.writes.length>0);f.queue.pause(id);await f.done(id,'paused');f.queue.resume(id);const error=await f.done(id,'error');
    assert.equal(error.writtenBytes,0,scenario);assert.equal(f.dest.state.writes.length,1,scenario);assert.equal(f.dest.state.committed,'original');assert.equal(error.restartRequired,true);await f.queue.dispose();
  }
});
test('416 at exact verified EOF with matching metadata permits finalization', async () => {
  const f=fixture({get:(init,n,normal)=>n===1?new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('0123456789'));}}),{headers:{'Content-Length':'10',ETag:tag,'Accept-Ranges':'bytes'}}):normal(init)});
  const id=await f.start();await until(()=>f.dest.state.writes.length>0);f.queue.pause(id);await f.done(id,'paused');f.queue.resume(id);await f.done(id);
  assert.equal(f.calls.at(-1).init.headers.Range,'bytes=10-');assert.equal(f.dest.state.committed,'0123456789');await f.queue.dispose();
});
test('write failure makes the offset unusable and resets for manual Retry', async () => {
  let fail=true;const f=fixture({destination:destination({onWrite:()=>{if(fail)throw Error('disk failed');}})});const id=await f.start();
  const error=await f.done(id,'error');assert.equal(error.errorCode,'WRITE_FAILED');assert.equal(error.writtenBytes,0);assert.equal(f.gets,1);assert.equal(f.dest.state.committed,'original');
  fail=false;f.queue.resume(id);await f.done(id);assert.equal(f.calls.at(-1).init.headers.Range,undefined);assert.equal(f.dest.state.opened,2);await f.queue.dispose();
});
test('separate files run concurrently, limit changes are bounded, same destination is rejected', async () => {
  const destinations=Array.from({length:4},()=>destination());let pick=0;
  const f=fixture({pickFile:()=>destinations[pick++].handle,get:stalledGet,concurrency:2});
  for(let i=0;i<4;i++)await f.start({...file,objectId:`object-${i}`});
  await until(()=>f.gets===2);assert.equal(f.queue.getConcurrency(),2);f.queue.setConcurrency(99);assert.equal(f.queue.getConcurrency(),2);
  f.queue.setConcurrency(3);await until(()=>f.gets===3);assert.equal(f.queue.getSnapshot().filter(i=>i.status==='downloading').length,3);
  await f.queue.cancel(f.queue.getSnapshot()[0].id);await until(()=>f.gets===4);await f.queue.dispose();assert.ok(destinations.every(d=>d.state.committed==='original'));
  const same=fixture({get:stalledGet});await same.start();await same.start({...file,objectId:'object-second'});
  assert.equal(same.queue.getSnapshot()[1].errorCode,'DESTINATION_BUSY');assert.equal(same.gets,1);await same.queue.dispose();
});
test('dispose isolates accounts and late picker/write completions cannot start new requests', async () => {
  const choice=deferred();const f=fixture({pickFile:()=>choice.promise});const pending=f.queue.start(file);const disposed=f.queue.dispose();choice.resolve(f.dest.handle);await pending;await disposed;
  assert.equal(f.gets,0);assert.deepEqual(f.queue.getSnapshot(),[]);
  const gate=deferred();const running=fixture({destination:destination({onWrite:()=>gate.promise})});await running.start();await until(()=>running.dest.state.writes.length===1);
  const shutdown=running.queue.dispose();gate.resolve();await shutdown;assert.equal(running.dest.state.committed,'original');assert.equal(running.calls.length,2);assert.deepEqual(running.queue.getSnapshot(),[]);
});
test('permission revocation stops active work; unauthorized response expires the owner', async () => {
  const f=fixture({get:stalledGet});const id=await f.start();await until(()=>f.dest.state.writes.length>0);f.queue.setEnabled(false);await f.done(id,'paused');f.queue.resume(id);await tick();assert.equal(f.gets,1);await f.queue.dispose();
  let expired=0;const unauthorized=fixture({head:()=>new Response(null,{status:401}),onUnauthorized:()=>expired++});const uid=await unauthorized.start();assert.equal((await unauthorized.done(uid,'error')).errorCode,'AUTHENTICATION');assert.equal(expired,1);await unauthorized.queue.dispose();
});
test('native fallback has no app progress, makes no managed requests and respects explicit capability', async () => {
  const f=fixture();f.queue.setEnabled(true,{rangeRead:false});await f.queue.start(file);assert.equal(f.gets,0);assert.equal(f.picks,0);assert.equal(f.natives.length,1);assert.equal(f.queue.getSnapshot()[0].status,'native');
  await f.queue.clearFinished();assert.deepEqual(f.queue.getSnapshot(),[]);await f.queue.dispose();
  assert.equal(supportsManagedDownloads({isSecureContext:true,showSaveFilePicker(){},ReadableStream}),true);
  for(const environment of [{},{isSecureContext:true,ReadableStream},{isSecureContext:false,showSaveFilePicker(){},ReadableStream}])assert.equal(supportsManagedDownloads(environment),false);
});
test('picker cancellation does not start native download; failed picker can be retried explicitly', async () => {
  const f=fixture({pickFile:()=>{throw new DOMException('cancel','AbortError');}});const id=await f.start();await f.done(id,'cancelled');assert.equal(f.natives.length,0);assert.equal(f.calls.length,0);await f.queue.dispose();
});

test('idle and connection deadlines release resources without reporting success', async () => {
  const f=fixture({get:(init,n)=>n===1?stalledGet(init):new Response(new ReadableStream(),{status:206,headers:{'Content-Length':'7',ETag:tag,'Accept-Ranges':'bytes','Content-Range':'bytes 3-9/10'}}),queue:{idleTimeoutMs:10}});const id=await f.start();
  await f.done(id,'error');assert.equal(f.dest.state.committed,'original');assert.equal(f.gets,3);await f.queue.dispose();
  let signal;
  const stalled=fixture({queue:{connectionTimeoutMs:10},head:init=>{signal=init.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));}});
  const sid=await stalled.start();await stalled.done(sid,'error');assert.equal(signal.aborted,true);assert.equal(stalled.dest.state.opened,0);await stalled.queue.dispose();
});
test('server cooldown over5min requires manual intervention and is never shortened', async () => {
  const f=fixture({get:()=>new Response(null,{status:429,headers:{'Retry-After':'600'}})});const id=await f.start();await f.done(id,'error');assert.equal(f.gets,1);
  f.queue.resume(id);assert.equal(f.queue.getSnapshot()[0].status,'error');assert.equal(f.queue.getSnapshot()[0].errorCode,'COOLDOWN');assert.equal(f.gets,1);await f.queue.dispose();
});
test('disk close failure is not completion; controls cannot cancel during commit', async () => {
  const gate=deferred();const f=fixture({destination:destination({close:async()=>{await gate.promise;throw Error('close failure');}})});
  const id=await f.start();await until(()=>f.queue.getSnapshot()[0].status==='finalizing');
  f.queue.pause(id);await f.queue.cancel(id);assert.equal(f.queue.getSnapshot()[0].status,'finalizing');gate.resolve();
  assert.equal((await f.done(id,'error')).errorCode,'WRITE_FAILED');assert.equal(f.dest.state.committed,'original');await f.queue.dispose();
});
test('zero-byte file completes by verified full EOF and successful disk close', async () => {
  const f=fixture();f.change('');const id=await f.start();const done=await f.done(id);assert.equal(done.sizeBytes,0);assert.equal(done.writtenBytes,0);assert.equal(f.dest.state.committed,'');await f.queue.dispose();
});
test('a rejected write during Pause still discards uncertain offset', async () => {
  const gate=deferred();const f=fixture({destination:destination({onWrite:async()=>{await gate.promise;throw Error('failed');}})});
  const id=await f.start();await until(()=>f.dest.state.writes.length===1);f.queue.pause(id);gate.resolve();const error=await f.done(id,'error');assert.equal(error.writtenBytes,0);assert.equal(error.errorCode,'WRITE_FAILED');await f.queue.dispose();
});
test('scope teardown aborts a pending native initiation before it can navigate', async () => {
  let signal,navigated=false;
  const gate=deferred();const f=fixture({nativeDownload:async(_storage,_object,options)=>{signal=options.signal;await gate.promise;if(!signal.aborted)navigated=true;}});
  const pending=f.queue.start(file,{managed:false});await until(()=>Boolean(signal));await f.queue.dispose();gate.resolve();await pending;
  assert.equal(signal.aborted,true);assert.equal(navigated,false);assert.deepEqual(f.queue.getSnapshot(),[]);
});

test('native initiation is deduplicated and cancellation cannot become a late success', async () => {
  const gate=deferred();let signal;
  const f=fixture({nativeDownload:async(_s,_o,options)=>{signal=options.signal;await gate.promise;}});
  const starting=f.queue.start(file,{managed:false});await until(()=>Boolean(signal));const id=f.queue.getSnapshot()[0].id;
  await f.queue.useNative(id);assert.equal(f.natives.length,1);
  await f.queue.cancel(id);gate.resolve();await starting;await f.done(id,'cancelled');
  assert.equal(signal.aborted,true);assert.equal(f.queue.getSnapshot()[0].status,'cancelled');await f.queue.dispose();
});

test('oversized streams and invalid metadata fail before committing or appending', async () => {
  for(const scenario of ['overrun','missing-length','encoded','bad-tag','head']) {
    const headers={'Content-Length':'10',ETag:scenario==='bad-tag'?'"internal-provider-tag"':tag,'Accept-Ranges':'bytes'};
    if(scenario==='missing-length')delete headers['Content-Length'];
    if(scenario==='encoded')headers['Content-Encoding']='gzip';
    const f=fixture({...(scenario==='head'?{head:()=>new Response(null,{headers:{'Content-Length':'10','Accept-Ranges':'bytes'}})}:{}),
      get:()=>new Response(scenario==='overrun'?'01234567890':'0123456789',{headers})});
    const id=await f.start();const error=await f.done(id,'error');assert.equal(error.errorCode,'INVALID_RESPONSE',scenario);
    assert.equal(error.writtenBytes,0);assert.equal(f.dest.state.committed,'original');assert.equal(f.dest.state.writes.length,0);await f.queue.dispose();
  }
});
test('a continuously active stream can exceed both connection and idle intervals in total', async () => {
  const f=fixture({queue:{connectionTimeoutMs:20,idleTimeoutMs:40},get:()=>{
    let offset=0;
    return new Response(new ReadableStream({async pull(c){await new Promise(resolve=>setTimeout(resolve,10));if(offset===10){c.close();return;}c.enqueue(encoder.encode(String(offset++)));}}),{headers:{'Content-Length':'10',ETag:tag,'Accept-Ranges':'bytes'}});
  }});
  const id=await f.start();await f.done(id);assert.equal(f.gets,1);assert.equal(f.dest.state.committed,'0123456789');await f.queue.dispose();
});

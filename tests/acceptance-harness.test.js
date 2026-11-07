import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { validateConfig, syntheticPart, PART_BYTES, blockedReport, scenario, fingerprint, privateJson, closeServer } from '../scripts/acceptance/support.mjs';
import { inventory, requireEmptyBucket, cleanOwnedResources, MARKER_KEY } from '../scripts/acceptance/isolation.mjs';
import { parseArgs, retryRequest, identityMatches, childProcess } from '../scripts/acceptance/run.mjs';

const base = { isolatedTestResources:true,endpoint:'http://127.0.0.1:9000',bucket:'nexora-acceptance-unit-test',
  confirmDisposableBucket:'nexora-acceptance-unit-test',sharedStorageRoot:'/test/source',maxLogicalBytes:200*1024**2,
  maxParentRssBytes:512*1024**2,maxSharedRssBytes:512*1024**2 };

test('acceptance configuration refuses production-style buckets, credentials in files and implicit writes',()=>{
  assert.equal(validateConfig(base).endpoint,'http://127.0.0.1:9000');
  for(const change of [{isolatedTestResources:false},{bucket:'production'},{confirmDisposableBucket:'other'},
    {endpoint:'http://storage.example.com'},{endpoint:'https://user:password@example.test'},
    {endpoint:'https://example.test/path'},{endpoint:'https://example.test?key=value'},
    {accessKeyId:'never-in-config'},{maxLogicalBytes:0},{maxParentRssBytes:0},{sizesMiB:[100,999]},
    {concurrentFiles:5},{slowPartSeconds:240},{sharedProxyUrl:'https://test-proxy.invalid'}]) {
    assert.throws(()=>validateConfig({...base,...change}));
  }
  assert.equal(parseArgs([]).run,false);
  assert.throws(()=>parseArgs(['--run']));
  assert.throws(()=>parseArgs(['--cleanup-journal','private.json']));
  assert.throws(()=>parseArgs(['--unknown']));
});

test('synthetic payload is reproducible, part-specific and bounded independently of file size',()=>{
  const a=syntheticPart('seed',1,65536),b=syntheticPart('seed',1,65536),c=syntheticPart('seed',2,65536);
  assert.deepEqual(a,b);assert.notDeepEqual(a,c);
  assert.throws(()=>syntheticPart('seed',1,PART_BYTES+1));
  assert.throws(()=>syntheticPart('seed',0,1));
  assert.notDeepEqual(a,Buffer.alloc(a.length));
});

function fakeProvider({unknown=false,nonempty=false,mismatch=false}={}) {
  const key=randomUUID(),sessionId=randomUUID(),calls=[];
  const journal={runId:'test-run',markerToken:'test-token',scopeFingerprint:fingerprint(base.endpoint,base.bucket),objects:{[key]:{sessionId}}};
  let marker=true,object=true,mpu=true;
  const sdk=Object.fromEntries(['HeadBucket','ListObjectsV2','ListMultipartUploads','GetObject','DeleteObject','AbortMultipartUpload'].map(name=>{
    const command=class {constructor(input){this.input=input;this.kind=name;}};return [name+'Command',command];
  }));
  const send=async command=>{
    calls.push(command);
    if(command.kind==='ListObjectsV2')return {Contents:[...(marker?[{Key:MARKER_KEY}]:[]),...(object?[{Key:key}]:[]),...(unknown || nonempty?[{Key:'foreign-object'}]:[])]};
    if(command.kind==='ListMultipartUploads')return {Uploads:mpu?[{Key:key,UploadId:'test-private-id'}]:[]};
    if(command.kind==='GetObject')return {Body:[Buffer.from(JSON.stringify({runId:journal.runId,token:mismatch?'wrong':journal.markerToken}))]};
    if(command.kind==='AbortMultipartUpload')mpu=false;
    if(command.kind==='DeleteObject') {if(command.input.Key===MARKER_KEY)marker=false;else {assert.equal(command.input.Key,key);object=false;}}
    return {};
  };
  return {sdk,send,journal,calls};
}

test('nonempty bucket is refused before any write; cleanup refuses foreign resources and wrong marker',async()=>{
  const p=fakeProvider({nonempty:true});
  await assert.rejects(requireEmptyBucket(p.send,p.sdk,base.bucket),{code:'BUCKET_NOT_EMPTY_NO_WRITES_ALLOWED'});
  assert.ok(p.calls.every(c=>!['DeleteObject','AbortMultipartUpload'].includes(c.kind)));
  for(const options of [{unknown:true},{mismatch:true}]) {
    const f=fakeProvider(options);
    await assert.rejects(cleanOwnedResources(f.send,f.sdk,base,f.journal));
    assert.ok(!f.calls.some(c=>['DeleteObject','AbortMultipartUpload'].includes(c.kind)));
  }
});

test('cleanup is limited to journal-owned exact keys and verifies no remaining MPU or object',async()=>{
  const p=fakeProvider();
  const result=await cleanOwnedResources(p.send,p.sdk,base,p.journal,{removeMarker:true});
  assert.deepEqual(result,{remainingObjects:0,remainingMultipartUploads:0});
  assert.equal(p.calls.filter(c=>c.kind==='AbortMultipartUpload').length,1);
  assert.equal(p.calls.filter(c=>c.kind==='DeleteObject').length,2);
  const forged={...p.journal,scopeFingerprint:'different'};
  await assert.rejects(cleanOwnedResources(p.send,p.sdk,base,forged),{code:'JOURNAL_SCOPE_MISMATCH'});
});

test('provider inventory follows pagination with bounds and rejects stuck cursors',async()=>{
  const p=fakeProvider();let count=0;
  const send=async command=>command.kind==='ListObjectsV2' ? (++count===1?{Contents:[],IsTruncated:true,NextContinuationToken:'next'}:{Contents:[]}) : {Uploads:[]};
  assert.deepEqual(await inventory(send,p.sdk,base.bucket),{keys:[],uploads:[]});
  assert.equal(count,2);
  await assert.rejects(inventory(async command=>command.kind==='ListObjectsV2'?{IsTruncated:true}: {},p.sdk,base.bucket),{code:'INVALID_INVENTORY_CURSOR'});
});

test('reports keep unexecuted provider scenarios BLOCKED and sanitize exception contents',async()=>{
  const r=blockedReport();assert.ok(r.scenarios.every(s=>s.status==='BLOCKED'));assert.equal(r.measurements,null);
  await scenario(r,'upload-100MiB',async()=>{throw new Error('credential/provider-reference must not be printed');});
  assert.equal(r.scenarios.find(s=>s.id==='upload-100MiB').status,'FAIL');
  assert.doesNotMatch(JSON.stringify(r),/credential\/provider-reference/);
  assert.equal(r.evidence,'not-run');
});

test('retry is bounded and permanent denial is not retried',async()=>{
  let calls=0,retries=0;
  const response=await retryRequest(async()=>new Response('',{status:++calls===1?503:200}),{onRetry:()=>retries++});
  assert.equal(response.status,200);assert.equal(calls,2);assert.equal(retries,1);
  calls=0;assert.equal((await retryRequest(async()=>{calls++;return new Response('',{status:403});})).status,403);assert.equal(calls,1);
  await assert.rejects(retryRequest(async()=>{throw new Error('private');},{attempts:1}),{code:'RETRY_BUDGET_EXHAUSTED'});
});

test('proxy identity handshake refuses an endpoint not serving this test run',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({runId:'another',proof:'another'}));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {await assert.rejects(identityMatches(`http://127.0.0.1:${server.address().port}`,{runId:'expected',proof:'expected'}),{code:'PROXY_IS_NOT_THIS_ISOLATED_RUN'});}
  finally{await closeServer(server);}
});

test('private cleanup journal is created with owner-only file access',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nexora-acceptance-unit-'));
  try{const path=join(dir,'journal.json');privateJson(path,{runId:'test'});assert.equal(statSync(path).mode & 0o777,0o600);assert.equal(JSON.parse(readFileSync(path,'utf8')).runId,'test');}
  finally{rmSync(dir,{recursive:true,force:true});}
});

test('isolated Shared acceptance worker boots and stops without any S3 network operation',{
  skip:!process.env.NEXORA_SHARED_STORAGE_ROOT || !process.env.NEXORA_ACCEPTANCE_TEST_DEPENDENCIES,
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nexora-acceptance-worker-test-'));
  const journalPath=join(dir,'journal.json'),identity={runId:'unit-run',proof:'unit-proof'};
  privateJson(journalPath,{runId:identity.runId,markerToken:'unit-marker',scopeFingerprint:fingerprint(base.endpoint,base.bucket),objects:{}});
  const worker=childProcess({...base,sharedStorageRoot:process.env.NEXORA_SHARED_STORAGE_ROOT,
    dependencyRoot:process.env.NEXORA_ACCEPTANCE_TEST_DEPENDENCIES,credentials:{accessKeyId:'test-only',secretAccessKey:'test-only'},
    identity,journalPath,databasePath:join(dir,'shared.sqlite'),appSecret:'test-only-app',sharedPort:0},()=>{});
  try{
    const ready=await worker.start();assert.ok(ready.port>0);
    await identityMatches(`http://127.0.0.1:${ready.port}`,identity);
    const metrics=await worker.rpc('metrics');assert.deepEqual(metrics.commandCounts,{});
    const audit=await worker.rpc('audit');assert.equal(audit.nonterminalSessions,0);assert.equal(audit.orphanedSessionMetadata,0);assert.deepEqual(audit.commandCounts,{});
  }finally{await worker.stop();rmSync(dir,{recursive:true,force:true});}
});

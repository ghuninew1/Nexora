import process from 'node:process';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { createApiHandler } from '../../functions/_lib/api.js';
import { createUser, login } from '../../functions/_lib/auth.js';
import { STORAGE_PERMISSION_NAMES } from '../../functions/_lib/storage-permissions.js';
import { AcceptanceError, check, validateConfig, fingerprint, privateJson, syntheticPart, d1,
  webServer, closeServer, blockedReport, scenario, reportMarkdown, MiB, PART_BYTES } from './support.mjs';
import { MARKER_KEY, requireEmptyBucket, cleanOwnedResources } from './isolation.mjs';
import { verifyStreamingDownload, verifyIfRangeFallback } from './download.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const digest = bytes=>createHash('sha256').update(bytes).digest('base64');
const sleep=ms=>new Promise(resolveSleep=>setTimeout(resolveSleep,ms));

export function parseArgs(args) {
  const out={run:false};
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(key==='--run')out.run=true;
    else if(['--config','--report-dir','--cleanup-journal'].includes(key)) {check(args[i+1] && !args[i+1].startsWith('--'),'MISSING_ARGUMENT');out[key.slice(2)]=args[++i];}
    else throw new AcceptanceError('UNKNOWN_ARGUMENT');
  }
  check(!(out['cleanup-journal'] && !out.run),'CLEANUP_REQUIRES_RUN');
  check(!out.run || out.config,'RUN_REQUIRES_CONFIG');
  return out;
}
function saveReport(directory,report) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  privateJson(join(directory,'results.json'),report);
  writeFileSync(join(directory,'results.md'),reportMarkdown(report),{mode:0o600});
}
function dependency(config) { return createRequire(join(config.dependencyRoot || config.sharedStorageRoot,'package.json'))('@aws-sdk/client-s3'); }
export function childProcess(config,onMetrics) {
  // Never inherit production credentials or DATABASE_PATH into the child.
  const child=fork(new URL('./provider-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:[],env:{PATH:process.env.PATH}});
  const pending=new Map();let nextId=0;
  child.on('message',message=>{
    if(message.type==='metrics')onMetrics(message);
    if(message.type==='result') {
      const handler=pending.get(message.id); if(!handler)return;
      pending.delete(message.id);clearTimeout(handler.timer);
      if(message.value?.peakRss)onMetrics(message.value);
      if(message.error)handler.reject(new AcceptanceError('WORKER_RPC_FAILED'));else handler.resolve(message.value);
    }
  });
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new AcceptanceError('WORKER_EXITED'));}pending.clear();});
  const rpc=(action,extra={})=>new Promise((resolveRpc,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(new AcceptanceError('WORKER_RPC_TIMEOUT'));},300000);
    pending.set(id,{resolve:resolveRpc,reject,timer});
    child.send({id,action,...extra},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(new AcceptanceError('WORKER_SEND_FAILED'));}});
  });
  return {child,rpc,async start(){return rpc('boot',{config});},async stop(){
    if(child.exitCode!==null || child.signalCode)return;
    try {await Promise.race([rpc('stop'),sleep(5000).then(()=>{throw new AcceptanceError('WORKER_STOP_TIMEOUT');})]);}
    catch {child.kill('SIGTERM');}
    if(child.exitCode===null && !child.signalCode) {
      await Promise.race([once(child,'exit'),sleep(3000)]);
      if(child.exitCode===null && !child.signalCode){child.kill('SIGKILL');await once(child,'exit');}
    }
  }};
}
export async function identityMatches(url,identity) {
  const response=await fetch(`${url}/__acceptance__/identity`,{redirect:'error',signal:AbortSignal.timeout(15000)});
  check(response.ok,'PROXY_IDENTITY_HTTP_FAILED');
  const text=await response.text();check(text.length<4096,'PROXY_IDENTITY_INVALID');
  const actual=JSON.parse(text);
  check(actual.runId===identity.runId && actual.proof===identity.proof,'PROXY_IS_NOT_THIS_ISOLATED_RUN');
}
export async function retryRequest(action,{attempts=5,onRetry=()=>{}}={}) {
  let response;
  for(let i=0;i<attempts;i++) {
    try {response=await action();if(![409,429,502,503,504].includes(response.status))return response;}
    catch(error){if(error instanceof AcceptanceError)throw error;}
    if(i<attempts-1){onRetry();await response?.body?.cancel();await sleep(Math.min(250*2**i,4000));}
  }
  check(response && response.status<400,'RETRY_BUDGET_EXHAUSTED');return response;
}
async function requireData(response,status=200) {
  check(response.status===status,`HTTP_${response.status}_EXPECTED_${status}`);
  const body=await response.json();check(body && body.data,'INVALID_API_RESPONSE');return body.data;
}

export async function runAcceptance(config,report,credentials,{cleanupJournal}={}) {
  for(const entry of report.scenarios) if(entry.status==='BLOCKED') entry.reason=cleanupJournal?'CLEANUP_ONLY_RUN':'PREREQUISITE_NOT_COMPLETED';
  let sdk;
  try { sdk=dependency(config); } catch { throw new AcceptanceError('TEST_DEPENDENCIES_UNAVAILABLE'); }
  const client=new sdk.S3Client({endpoint:config.endpoint,region:config.region,forcePathStyle:true,maxAttempts:1,
    requestChecksumCalculation:'WHEN_REQUIRED',credentials});
  const send=command=>client.send(command,{abortSignal:AbortSignal.timeout(60000)});
  if(cleanupJournal) {
    try {return await cleanOwnedResources(send,sdk,config,JSON.parse(readFileSync(cleanupJournal,'utf8')),{removeMarker:true});}
    finally {client.destroy();}
  }
  report.sourceHashes={};
  for(const [prefix,base,files] of [
    ['nexora',root,['functions/_lib/upload-sessions.js','functions/_lib/storage-client.js','functions/_lib/api.js','migrations/0011_transfer_sessions.sql']],
    ['shared',config.sharedStorageRoot,['src/storage/uploads.js','src/storage/multipart-provider.js','src/storage/upload-routes.js','src/index.js','migrations/0002_resumable_uploads.sql']],
  ]) for(const file of files) report.sourceHashes[`${prefix}/${file}`]=createHash('sha256').update(readFileSync(join(base,file))).digest('hex');
  const directory=mkdtempSync(join(tmpdir(),'nexora-acceptance-'));
  const journalPath=join(directory,'private-provider-journal.json');
  const identity={runId:randomUUID(),proof:randomBytes(32).toString('hex')};
  let journal={schemaVersion:1,runId:identity.runId,markerToken:randomBytes(32).toString('hex'),scopeFingerprint:fingerprint(config.endpoint,config.bucket),objects:{}};
  privateJson(journalPath,journal);
  report.privateWorkspace=directory; // Local path only; never credentials or provider references.
  report.evidence='real-provider-attempt';
  for(const [id,reason] of Object.entries({
    'browser-native-durable-recovery':'NATIVE_BROWSER_OS_AND_CONNECTIVITY_EVIDENCE_REQUIRED',
    'real-platform-logout-revocation':'DEPLOYED_SESSION_AND_PERMISSION_REVOCATION_EVIDENCE_REQUIRED',
    'storage-unavailability':'OPERATOR_CONTROLLED_ISOLATED_OUTAGE_EVIDENCE_REQUIRED',
    'provider-cpu-disk-throughput':'PROVIDER_OS_CPU_DISK_AND_CAPACITY_MONITORING_REQUIRED',
  })) report.scenarios.find(s=>s.id===id).reason=reason;
  report.providerVersion={operatorAttested:config.operatorProviderVersion || null, independentlyVerified:false};
  report.measurements={parentPeakRssBytes:process.memoryUsage().rss,sharedPeakRssBytes:0,sharedPeakActiveParts:0,
    environment:{node:process.version,sharedHttp:'actual Hono app factory and @hono/node-server; loopback unless explicitly proxied',nexoraRuntime:'Node HTTP using actual API handler; not workerd'},retryCounts:{automatic:0,controlledFailureRetries:0},requestCount:0};
  let owned=false,worker,server,db,cookie,origin,sharedUrl,aborted=false;
  let sharedMetrics={peakRss:0,peakActiveParts:0,commandCounts:{}};
  const shutdown=new AbortController();
  const onSignal=()=>{aborted=true;shutdown.abort();};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  const sampler=setInterval(()=>{report.measurements.parentPeakRssBytes=Math.max(report.measurements.parentPeakRssBytes,process.memoryUsage().rss);},250);
  sampler.unref();
  const updateMetrics=value=>{
    sharedMetrics=value;
    report.measurements.sharedPeakRssBytes=Math.max(report.measurements.sharedPeakRssBytes,value.peakRss || 0);
    report.measurements.sharedPeakActiveParts=Math.max(report.measurements.sharedPeakActiveParts,value.peakActiveParts || 0);
  };
  const refreshJournal=()=>{journal=JSON.parse(readFileSync(journalPath,'utf8'));return journal;};
  const workerConfig={...config,credentials,identity,journalPath,databasePath:join(directory,'shared.sqlite'),appSecret:randomBytes(32).toString('hex')};
  try {
    const preflight=await scenario(report,'isolated-provider-preflight',async()=>{
      await requireEmptyBucket(send,sdk,config.bucket);
      owned=true;
      await send(new sdk.PutObjectCommand({Bucket:config.bucket,Key:MARKER_KEY,ContentType:'application/json',
        Body:JSON.stringify({runId:journal.runId,token:journal.markerToken})}));
      return {emptyBucketVerified:true,ownershipMarkerWritten:true,providerTransport:'real AWS SDK network requests'};
    });
    if(!preflight)return;
    worker=childProcess(workerConfig,updateMetrics);
    const ready=await worker.start();workerConfig.sharedPort=ready.port;
    sharedUrl=`http://127.0.0.1:${ready.port}`;
    if(config.sharedProxyUrl){await identityMatches(config.sharedProxyUrl,identity);sharedUrl=config.sharedProxyUrl;}
    db=new DatabaseSync(join(directory,'nexora.sqlite'));
    for(const file of readdirSync(join(root,'migrations')).filter(f=>/^\d{4}_.+\.sql$/u.test(f)).sort())db.exec(readFileSync(join(root,'migrations',file),'utf8'));
    const env={DB:d1(db),STORAGE_RESUMABLE_UPLOADS_ENABLED:'true',STORAGE_API_URL:sharedUrl,STORAGE_APP_SECRET:workerConfig.appSecret,
      CF_ACCESS_CLIENT_ID:'acceptance-placeholder',CF_ACCESS_CLIENT_SECRET:'acceptance-placeholder'};
    const password=randomBytes(24).toString('hex');
    const user=await createUser({db:env.DB,email:'acceptance@example.test',displayName:'Isolated acceptance',password});
    db.prepare("INSERT INTO storage_mounts(id,owner_user_id,name,provider,status,read_only,shared_storage_project_id,created_at,updated_at) VALUES ('acceptance-mount',?,'Isolated','garage','active',0,'acceptance-project',1,1)").run(user.id);
    const columns=STORAGE_PERMISSION_NAMES.map(n=>'can_'+n.replace(/[A-Z]/gu,c=>'_'+c.toLowerCase()));
    db.prepare(`INSERT INTO storage_access(storage_id,user_id,${columns.join(',')},created_at,updated_at) VALUES (${Array(columns.length+4).fill('?').join(',')})`)
      .run('acceptance-mount',user.id,...columns.map(()=>1),1,1);
    const authenticated=await login(new Request('https://acceptance.example.test'),env,{email:user.email,password});
    cookie=`nexora_session=${authenticated.token}`;
    const handler=createApiHandler({fetchImpl:(url,init)=>fetch(url,{...init,...(init.body instanceof ReadableStream?{duplex:'half'}:{})}),logger:{warn(){}}});
    server=await webServer(request=>handler(request,env),{port:config.nexoraPort,publicOrigin:config.nexoraProxyUrl,identity});
    report.measurements.nexoraNodeHttp={requestTimeoutMs:server.requestTimeout,headersTimeoutMs:server.headersTimeout,keepAliveTimeoutMs:server.keepAliveTimeout};
    origin=`http://127.0.0.1:${server.address().port}`;
    if(config.nexoraProxyUrl){await identityMatches(config.nexoraProxyUrl,identity);origin=config.nexoraProxyUrl;}
    const retry=action=>retryRequest(action,{onRetry:()=>{report.measurements.retryCounts.automatic++;}});
    const base=`${origin}/api/storage/v1/storages/acceptance-mount/uploads`;
    const api=async(suffix='',{method='GET',body,headers={},signal,slowSeconds=0}={})=>{
      check(!aborted,'RUN_INTERRUPTED');
      check(report.measurements.parentPeakRssBytes<=config.maxParentRssBytes && report.measurements.sharedPeakRssBytes<=config.maxSharedRssBytes,'MEMORY_BUDGET_EXCEEDED');
      report.measurements.requestCount++;
      let requestBody=body;
      if(body!==undefined && !(body instanceof Uint8Array)){requestBody=JSON.stringify(body);headers={'Content-Type':'application/json',...headers};}
      if(slowSeconds) {
        const bytes=requestBody;let offset=0;
        requestBody=new ReadableStream({async pull(controller){
          if(offset===bytes.length){controller.close();return;}
          await sleep(slowSeconds*1000/128);
          const next=Math.min(offset+Math.ceil(bytes.length/128),bytes.length);
          controller.enqueue(bytes.subarray(offset,next));offset=next;
        }});
      }
      return fetch(base+suffix,{method,headers:{Cookie:cookie,Origin:origin,...headers},body:requestBody,redirect:'error',
        signal:AbortSignal.any([shutdown.signal,signal || AbortSignal.timeout(300000)]),...(requestBody instanceof ReadableStream?{duplex:'half'}:{})});
    };
    const status=async id=>requireData(await retry(()=>api(`/${id}`)));
    const create=async(size,key=randomUUID())=>requireData(await retry(()=>api('',{method:'POST',headers:{'Idempotency-Key':key},
      body:{name:`acceptance-${key}.bin`,sizeBytes:size,mimeType:'application/octet-stream',parentId:null}})),201);
    const put=(id,n,bytes,options={})=>api(`/${id}/parts/${n}`,{method:'PUT',body:bytes,
      headers:{'Content-Type':'application/octet-stream','X-Part-SHA256':digest(bytes)},...options});
    const complete=async id=>{
      const s=await status(id);
      return requireData(await retry(()=>api(`/${id}/complete`,{method:'POST',body:{version:s.version}})));
    };
    async function upload(size,{session,seed=randomUUID(),interruptAt,restartAt,dropPartAck=false,dropCompleteAck=false,slowSeconds=0,downloadAcceptance=false}={}) {
      check(size<=config.maxLogicalBytes,'CAPACITY_BUDGET_EXCEEDED');
      const s=session || await create(size),id=s.transferId;
      const expected=createHash('sha256'),started=performance.now();
      let retryCount=0;
      for(let n=1;n<=Math.ceil(size/PART_BYTES);n++) {
        const bytes=syntheticPart(seed,n,Math.min(PART_BYTES,size-(n-1)*PART_BYTES));expected.update(bytes);
        if(n===interruptAt) {
          // Intentionally destroy a real client HTTP socket halfway through a part.
          // This probe is local-hop only; slow proxy streaming has a separate scenario.
          const local=`http://127.0.0.1:${server.address().port}/api/storage/v1/storages/acceptance-mount/uploads/${id}/parts/${n}`;
          await new Promise(resolveInterrupted=>{
            const req=httpRequest(local,{method:'PUT',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/octet-stream',
              'X-Part-SHA256':digest(bytes),'Content-Length':bytes.length}});
            req.on('error',()=>resolveInterrupted());req.on('close',resolveInterrupted);
            req.write(bytes.subarray(0,65536));setTimeout(()=>req.destroy(),30);
          });
          await sleep(100);
          const recovered=await status(id);check(recovered.transferId===id && !recovered.parts.some(p=>p.partNumber===n),'INTERRUPTED_PART_WRONGLY_ACKNOWLEDGED');
          const audit=await worker.rpc('audit');check(audit.partiallyPublished===0 && audit.unpublishedObjects===0,'PARTIAL_PUBLICATION_DURING_INTERRUPTION');
          retryCount++;
        }
        if(dropPartAck && n===2){await worker.rpc('fault',{command:'UploadPartCommand'});const failed=await put(id,n,bytes);check(failed.status>=500,'PART_ACK_FAULT_NOT_OBSERVED');await failed.body?.cancel();retryCount++;}
        await requireData(await retry(()=>put(id,n,bytes,{slowSeconds:n===1?slowSeconds:0})));
        if(n===restartAt) {
          const before=await status(id);
          await requireData(await api(`/${id}/pause`,{method:'POST',body:{version:before.version}}));
          await worker.stop();worker=childProcess(workerConfig,updateMetrics);await worker.start();
          const after=await status(id);check(after.transferId===id && after.acknowledgedBytes===n*PART_BYTES,'RESTART_LOST_RECEIPTS');
          await requireData(await api(`/${id}/resume`,{method:'POST',body:{version:after.version}}));
        }
      }
      const beforeComplete=await worker.rpc('metrics');
      if(dropCompleteAck){await worker.rpc('fault',{command:'CompleteMultipartUploadCommand'});const s=await status(id);
        const failed=await api(`/${id}/complete`,{method:'POST',body:{version:s.version}});check(failed.status>=500,'COMPLETE_ACK_FAULT_NOT_OBSERVED');await failed.body?.cancel();retryCount++;}
      const result=await complete(id);check(result.state==='completed' && result.object.sizeBytes===size,'FINAL_SIZE_METADATA_MISMATCH');
      const duplicate=await complete(id);check(duplicate.object.objectId===result.object.objectId,'DUPLICATE_COMPLETION_CREATED_OBJECT');
      const afterComplete=await worker.rpc('metrics');
      check((afterComplete.commandCounts.CompleteMultipartUploadCommand || 0)-(beforeComplete.commandCounts.CompleteMultipartUploadCommand || 0)===1,'DUPLICATE_PROVIDER_COMPLETION');
      report.measurements.retryCounts.controlledFailureRetries+=retryCount;
      const uploadSeconds=(performance.now()-started)/1000,downloadStarted=performance.now();
      const hash=expected.digest('hex');
      const downloadOptions={url:`${origin}/api/storage/v1/storages/acceptance-mount/objects/${result.object.objectId}/download`,
        headers:{Cookie:cookie},size,sha256:hash,signal:shutdown.signal};
      await verifyStreamingDownload(downloadOptions);
      const downloadSeconds=(performance.now()-downloadStarted)/1000;
      const seconds=(performance.now()-started)/1000;
      if(downloadAcceptance) {
        await scenario(report,'download-interruption-range-integrity',()=>verifyStreamingDownload({...downloadOptions,interruptAfter:PART_BYTES}));
        await scenario(report,'download-stale-if-range',()=>verifyIfRangeFallback(downloadOptions));
        await scenario(report,'concurrent-downloads',async()=>{
          const results=await Promise.allSettled(Array.from({length:config.concurrentFiles},()=>verifyStreamingDownload(downloadOptions)));
          check(results.every(r=>r.status==='fulfilled'),'CONCURRENT_DOWNLOAD_FAILURE');
          return {files:config.concurrentFiles,allFullChecksumsVerified:true};
        });
      }
      return {sizeBytes:size,sha256:hash,checksumVerifiedThroughNexoraDownload:true,elapsedSeconds:Number(seconds.toFixed(3)),
        uploadPayloadMiBPerSecond:Number((size/MiB/uploadSeconds).toFixed(3)),
        downloadPayloadMiBPerSecond:Number((size/MiB/downloadSeconds).toFixed(3)),
        roundTripPayloadMiBPerSecond:Number((2*size/MiB/seconds).toFixed(3)),injectedFailureRetries:retryCount};
    }
    async function cleanBetween() { await cleanOwnedResources(send,sdk,config,refreshJournal()); }
    for(const [id,size] of [['upload-100MiB',100*MiB],['upload-1GiB',1024*MiB],['upload-10GiB',10240*MiB]]) {
      if(!config.sizesMiB.includes(size/MiB) || size>config.maxLogicalBytes){report.scenarios.find(s=>s.id===id).reason='SIZE_NOT_AUTHORIZED_OR_CAPACITY_UNCONFIRMED';continue;}
      await scenario(report,id,()=>upload(size,{downloadAcceptance:id==='upload-100MiB'}));await cleanBetween();
    }
    for(const [id,options] of [['interruption-same-session',{interruptAt:2}],['shared-process-restart-resume',{restartAt:2}],
      ['lost-part-ack-retry',{dropPartAck:true}],['lost-complete-ack-duplicate-completion',{dropCompleteAck:true}]]) {
      await scenario(report,id,()=>upload(100*MiB,options));await cleanBetween();
    }
    await scenario(report,'lost-create-ack',async()=>{
      const key=randomUUID();await worker.rpc('fault',{command:'CreateMultipartUploadCommand'});
      const failed=await api('',{method:'POST',headers:{'Idempotency-Key':key},body:{name:`acceptance-${key}.bin`,sizeBytes:100*MiB,mimeType:'application/octet-stream',parentId:null}});
      check(failed.status>=500,'CREATE_ACK_FAULT_NOT_OBSERVED');await failed.body?.cancel();report.measurements.retryCounts.controlledFailureRetries++;
      const session=await create(100*MiB,key);return upload(100*MiB,{session});
    });await cleanBetween();
    for(const id of ['cancel-abort','expiration-cleanup-clock-advanced']) {
      await scenario(report,id,async()=>{
        const s=await create(100*MiB);await requireData(await put(s.transferId,1,syntheticPart(s.transferId,1,PART_BYTES)));
        if(id==='cancel-abort')await requireData(await api(`/${s.transferId}`,{method:'DELETE'}));
        else {const cleanup=await worker.rpc('expire');check(cleanup.pending===0,'EXPIRY_CLEANUP_PENDING');}
        const state=await status(s.transferId);check(['cancelled','expired'].includes(state.state),'NONTERMINAL_CLEANUP_STATE');
        const audit=await worker.rpc('audit');check(audit.orphanMpus===0 && audit.unpublishedObjects===0 && audit.partiallyPublished===0,'ORPHANS_AFTER_ABORT_OR_EXPIRY');
        return {noOrphans:true,...(id.includes('clock')?{clockAdvancedDays:8,wallClockSchedulerVerified:false}:{})};
      });await cleanBetween();
    }
    if(config.concurrentFiles*100*MiB<=config.maxLogicalBytes) await scenario(report,'concurrent-files',async()=>{
      const out=await Promise.allSettled(Array.from({length:config.concurrentFiles},()=>upload(100*MiB)));
      check(out.every(o=>o.status==='fulfilled'),'CONCURRENT_UPLOAD_FAILURE');
      const observed=await worker.rpc('metrics');check(observed.peakActiveParts>=2 && observed.peakActiveParts<=4,'CONCURRENCY_NOT_OBSERVED_WITHIN_LIMIT');
      return {files:config.concurrentFiles,peakProviderParts:observed.peakActiveParts,allFullChecksumsVerified:true};
    });else report.scenarios.find(s=>s.id==='concurrent-files').reason='CONCURRENCY_CAPACITY_NOT_CONFIRMED';
    await cleanBetween();
    await scenario(report,'no-partial-publication',async()=>{const audit=await worker.rpc('audit');check(audit.partiallyPublished===0 && audit.unpublishedObjects===0 && audit.orphanMpus===0 && audit.nonterminalSessions===0 && audit.orphanedSessionMetadata===0,'PARTIAL_PUBLICATION_OR_ORPHANS');return {partiallyPublished:0,orphanMultipartUploads:0};});
    if(config.sharedProxyUrl || config.nexoraProxyUrl) {
      await scenario(report,'proxy-request-path',async()=>{
        check(report.scenarios.filter(s=>s.id.startsWith('upload-') && s.status!=='BLOCKED').every(s=>s.status==='PASS'),'PROXY_TRANSFER_SCENARIOS_FAILED');
        return {identityHandshakeVerified:true,sharedHop:Boolean(config.sharedProxyUrl),nexoraHop:Boolean(config.nexoraProxyUrl),allExecutedSizeScenariosPassed:true};
      });
      if(config.slowPartSeconds) {await scenario(report,'proxy-slow-part-timeout',()=>upload(100*MiB,{slowSeconds:config.slowPartSeconds}));await cleanBetween();}
      else report.scenarios.find(s=>s.id==='proxy-slow-part-timeout').reason='SLOW_PART_PROBE_NOT_REQUESTED';
    } else for(const id of ['proxy-request-path','proxy-slow-part-timeout'])report.scenarios.find(s=>s.id===id).reason='NO_ISOLATED_PROXY_OR_TUNNEL_PATH';
    report.scenarios.find(s=>s.id==='production-resource-retention-gates').reason='OPERATOR_LIMITS_RATE_ALERTS_AND_RETENTION_NOT_VERIFIED';
    updateMetrics(await worker.rpc('metrics'));
    await scenario(report,'resource-budgets',async()=>{
      check(report.measurements.parentPeakRssBytes<=config.maxParentRssBytes && report.measurements.sharedPeakRssBytes<=config.maxSharedRssBytes,'MEMORY_BUDGET_EXCEEDED');
      return {parentSampledPeakRssBytes:report.measurements.parentPeakRssBytes,sharedSampledPeakRssBytes:report.measurements.sharedPeakRssBytes};
    });
    report.measurements.lastSharedProcess=sharedMetrics;
    report.measurements.sampling='parent250ms/shared500ms plus S3 command boundaries; sampled peaks, not OS/container maxima';
    report.evidence='real-provider-executed';
  } finally {
    clearInterval(sampler);process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    await closeServer(server);await worker?.stop();db?.close();
    if(owned)await scenario(report,'final-provider-cleanup',()=>cleanOwnedResources(send,sdk,config,refreshJournal(),{removeMarker:true}));
    client.destroy();
  }
}

export async function main(args=process.argv.slice(2)) {
  const parsed=parseArgs(args),directory=resolve(parsed['report-dir'] || join(tmpdir(),`nexora-acceptance-report-${Date.now()}`));
  const report=blockedReport();
  if(!parsed.run) {saveReport(directory,report);process.stdout.write('BLOCKED: real-provider scenarios were not run. Report prepared.\n');return 2;}
  try {
    const config=validateConfig(JSON.parse(readFileSync(resolve(parsed.config),'utf8')));
    const accessKeyId=process.env.NEXORA_ACCEPTANCE_S3_ACCESS_KEY_ID,secretAccessKey=process.env.NEXORA_ACCEPTANCE_S3_SECRET_ACCESS_KEY;
    if(!accessKeyId || !secretAccessKey) {for(const s of report.scenarios)s.reason='TEST_ONLY_S3_CREDENTIALS_ABSENT';saveReport(directory,report);return 2;}
    if(parsed['cleanup-journal']) {
      const details=await runAcceptance(config,report,{accessKeyId,secretAccessKey},{cleanupJournal:resolve(parsed['cleanup-journal'])});
      Object.assign(report.scenarios.find(s=>s.id==='final-provider-cleanup'),{status:'PASS',reason:undefined,...details});report.evidence='real-provider-cleanup-only';
    } else await runAcceptance(config,report,{accessKeyId,secretAccessKey});
  } catch(error) {report.runError=error instanceof AcceptanceError?error.code:'RUN_SETUP_OR_EXECUTION_FAILED';}
  saveReport(directory,report);
  const failed=report.runError || report.scenarios.some(s=>s.status==='FAIL');
  process.stdout.write(failed?'FAIL: inspect the sanitized report and private cleanup journal.\n':'Acceptance finished; inspect PASS/BLOCKED scenarios in the report.\n');
  return failed?1:report.scenarios.some(s=>s.status==='BLOCKED')?2:0;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code=>{process.exitCode=code;}).catch(()=>{process.stderr.write('FAIL: invalid acceptance invocation.\n');process.exitCode=1;});
}

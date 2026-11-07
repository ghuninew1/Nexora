// Acceptance-only child process. Never import the production service entrypoint.
import process from 'node:process';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, dirname, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { privateJson, closeServer, check, fingerprint } from './support.mjs';

let db, server, s3, sdk, storage, createUploads, config, journal, metricsTimer;
let fault = null;
let peakRss = 0, peakHeapUsed = 0, peakExternal = 0, peakArrayBuffers = 0, activeParts = 0, peakActiveParts = 0;
const counts = {};
function memory() {
  const sample=process.memoryUsage();
  peakRss = Math.max(peakRss,sample.rss);peakHeapUsed=Math.max(peakHeapUsed,sample.heapUsed);
  peakExternal=Math.max(peakExternal,sample.external);peakArrayBuffers=Math.max(peakArrayBuffers,sample.arrayBuffers);
  return { peakRss, peakHeapUsed, peakExternal, peakArrayBuffers, peakActiveParts, commandCounts:counts,
    nodeHttp:server?{requestTimeoutMs:server.requestTimeout,headersTimeoutMs:server.headersTimeout,keepAliveTimeoutMs:server.keepAliveTimeout}:null };
}
async function boot(message) {
  config = message;
  check(dirname(config.databasePath)===dirname(config.journalPath) && basename(config.databasePath)==='shared.sqlite'
    && basename(dirname(config.databasePath)).startsWith('nexora-acceptance-'),'UNSAFE_TEST_DATABASE_PATH');
  // Only explicit acceptance source/dependency paths; no credential discovery chain.
  const source = pathToFileURL(config.sharedStorageRoot + '/');
  const requireDependency = createRequire(join(config.dependencyRoot || config.sharedStorageRoot,'package.json'));
  if (config.dependencyRoot) registerHooks({ resolve(specifier,context,nextResolve) {
    try { return nextResolve(specifier,context); }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) throw error;
      return nextResolve(pathToFileURL(requireDependency.resolve(specifier)).href, context);
    }
  } });
  sdk = requireDependency('@aws-sdk/client-s3');
  journal = JSON.parse(readFileSync(config.journalPath,'utf8'));
  check(journal.scopeFingerprint === fingerprint(config.endpoint,config.bucket), 'JOURNAL_SCOPE_MISMATCH');
  process.env.DATABASE_PATH = config.databasePath;
  ({ db } = await import(new URL('src/db.js',source)));
  const { applyMigrations } = await import(new URL('src/storage/migrations.js',source));
  const { createApp } = await import(new URL('src/app.js',source));
  const { createStorageManager } = await import(new URL('src/storage/manager.js',source));
  const { createProviderRegistry } = await import(new URL('src/storage/providers/index.js',source));
  const { createGarageProvider } = await import(new URL('src/storage/providers/garage.js',source));
  ({ createUploads } = await import(new URL('src/storage/uploads.js',source)));
  await applyMigrations(db); // Only a new acceptance-owned SQLite file, never remote.
  db.prepare("INSERT OR IGNORE INTO apps(id,name) VALUES ('acceptance-app','Acceptance')").run();
  db.prepare('INSERT OR IGNORE INTO app_credentials(id,app_id,secret_hash) VALUES (?,?,?)')
    .run('acceptance-credential','acceptance-app',createHash('sha256').update(config.appSecret).digest('hex'));
  db.prepare('INSERT OR IGNORE INTO projects(id,app_id,name,bucket) VALUES (?,?,?,?)')
    .run('acceptance-project','acceptance-app','Acceptance',config.bucket);
  s3 = new sdk.S3Client({endpoint:config.endpoint,region:config.region,forcePathStyle:true,maxAttempts:1,
    requestChecksumCalculation:'WHEN_REQUIRED',credentials:config.credentials});
  const transport = { async send(command,options) {
    const name = command.constructor.name;
    counts[name] = (counts[name] || 0) + 1;
    if (name === 'CreateMultipartUploadCommand') {
      const key = command.input.Key;
      journal.objects[key] = { sessionId:command.input.Metadata['upload-session'] };
      privateJson(config.journalPath,journal); // Persist intent before any provider mutation.
    }
    if (name === 'UploadPartCommand') { activeParts++; peakActiveParts=Math.max(peakActiveParts,activeParts); }
    try {
      const value = await s3.send(command,options);
      if (fault === name) { fault=null; throw new Error('ACCEPTANCE_DROPPED_ACK'); }
      return value;
    } finally { if (name === 'UploadPartCommand') activeParts--; memory(); }
  } };
  storage = createStorageManager(createProviderRegistry(createGarageProvider({s3:transport,timeoutMs:60000})));
  const app = createApp({db,storage,bucket:config.bucket,apiToken:'acceptance-unused',maxFileSize:25*1024**2,resumableUploads:true,
    logger:{warn(){},error(){}}});
  const { serve } = requireDependency('@hono/node-server');
  server = await new Promise((ready,reject) => {
    const instance = serve({hostname:'127.0.0.1',port:config.sharedPort,fetch:request =>
      new URL(request.url).pathname === '/__acceptance__/identity'
        ? Response.json(config.identity,{headers:{'Cache-Control':'no-store'}}) : app.fetch(request)}, () => ready(instance));
    instance.once('error',reject);
  });
  metricsTimer = setInterval(() => process.send?.({type:'metrics',...memory()}),500);
  metricsTimer.unref();
  return {port:server.address().port};
}
async function rpc(message) {
  if (message.action === 'boot') return boot(message.config);
  if (message.action === 'fault') { check(['CreateMultipartUploadCommand','UploadPartCommand','CompleteMultipartUploadCommand'].includes(message.command),'INVALID_FAULT'); fault=message.command; return {}; }
  if (message.action === 'audit') {
    const rows = db.prepare('SELECT * FROM upload_sessions').all();
    let orphanMpus=0, unpublishedObjects=0, nonterminalSessions=0, orphanedSessionMetadata=0;
    for (const row of rows) {
      const input={mount:{provider:'garage',bucket:config.bucket},providerRef:row.provider_reference,signal:AbortSignal.timeout(30000)};
      const mpuCount=(await storage.multipart.discover(input)).length;
      orphanMpus += mpuCount;
      if (row.state !== 'completed') {
        const object=await storage.multipart.head(input);
        if(object)unpublishedObjects++;
        if(!['cancelled','expired'].includes(row.state)) {
          nonterminalSessions++;
          if(!mpuCount && !object)orphanedSessionMetadata++;
        }
      }
    }
    const partiallyPublished = db.prepare("SELECT COUNT(*) n FROM upload_sessions u JOIN storage_objects o ON o.object_id=u.object_id WHERE u.state != 'completed'").get().n;
    return {orphanMpus,unpublishedObjects,partiallyPublished,nonterminalSessions,orphanedSessionMetadata,sessions:rows.length,...memory()};
  }
  if (message.action === 'expire') {
    // Explicit clock advancement in this acceptance-only instance, not a seven-day wait.
    const uploads=createUploads({db,provider:storage.multipart,now:()=>Date.now()+8*86400000});
    return uploads.sweep(100);
  }
  if (message.action === 'metrics') return memory();
  if (message.action === 'stop') {
    clearInterval(metricsTimer);
    await closeServer(server);
    db?.close(); s3?.destroy();
    return memory();
  }
  throw new Error('INVALID_RPC');
}
process.on('message', message => {
  void rpc(message).then(value => {
    process.send?.({type:'result',id:message.id,value});
    if (message.action === 'stop') process.disconnect();
  }).catch(() => process.send?.({type:'result',id:message.id,error:'ACCEPTANCE_WORKER_ERROR'}));
});
process.on('disconnect',()=>{ clearInterval(metricsTimer); server?.closeAllConnections(); server?.close(); s3?.destroy(); db?.close(); });

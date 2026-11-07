import { Buffer } from 'node:buffer';
import process from 'node:process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createApiHandler } from '../functions/_lib/api.js';
import { createUser, login } from '../functions/_lib/auth.js';
import { RESUMABLE_LIMITS, exactPartStream } from '../functions/_lib/upload-sessions.js';

const origin = 'https://nexora.example.test';
const path = '/api/storage/v1/storages/mount_test/uploads';
function d1(db) {
  return {
    async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    prepare(sql) {
      return { bind(...args) { return {
        async run() { return { meta: db.prepare(sql).run(...args) }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
      }; } };
    },
  };
}
async function fixture(fetchImpl) {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, migrations), 'utf8'));
  const env = { DB: d1(db), STORAGE_RESUMABLE_UPLOADS_ENABLED: 'true', STORAGE_API_URL: 'https://storage.example.test',
    STORAGE_APP_SECRET: 'test-only-secret', CF_ACCESS_CLIENT_ID: 'test-only-access-id', CF_ACCESS_CLIENT_SECRET: 'test-only-access-secret' };
  const user = await createUser({ db: env.DB, email: 'upload@example.test', displayName: 'Upload test', password: 'valid password for tests' });
  const other = await createUser({ db: env.DB, email: 'other-upload@example.test', displayName: 'Other', password: 'valid password for tests' });
  db.prepare("INSERT INTO storage_mounts(id,owner_user_id,name,provider,status,read_only,shared_storage_project_id,created_at,updated_at) VALUES (?,?,'Test','garage','active',0,'test-project',1,1)").run('mount_test',user.id);
  db.prepare('INSERT INTO storage_access(storage_id,user_id,can_upload,created_at,updated_at) VALUES (?,?,1,1,1)').run('mount_test',user.id);
  const session = await login(new Request(`${origin}/api/auth/login`),env,{email:user.email,password:'valid password for tests'});
  const otherSession = await login(new Request(`${origin}/api/auth/login`),env,{email:other.email,password:'valid password for tests'});
  const handler = createApiHandler({fetchImpl,logger:{warn(){}}});
  const request = (suffix = '', { method='GET', body, headers={}, token=session.token } = {}) => handler(new Request(origin+path+suffix, {
    method, headers: { Cookie: `nexora_session=${token}`, Origin:origin, ...(body && !(body instanceof Uint8Array) ? {'Content-Type':'application/json'} : {}), ...headers },
    ...(body === undefined ? {} : {body: body instanceof Uint8Array ? body : JSON.stringify(body)}),
  }),env);
  return {db,env,user,other,request,otherSession};
}
function mockProvider() {
  const sessions=new Map(), calls=[];
  let failPart=false, loseCreate=false;
  const fetchImpl=async (url, init) => {
    const p=new URL(url).pathname, id=p.split('/')[5];
    calls.push({p,init});
    if (p.endsWith('/capabilities')) return Response.json({capabilities:{upload:true,transfers:{resumableUpload:true,...RESUMABLE_LIMITS}}});
    if (p.endsWith('/uploads') && init.method==='POST') {
      const body=JSON.parse(init.body), key=init.headers.get('Idempotency-Key');
      let s=[...sessions.values()].find(s=>s.key===key);
      if (!s) { s={key,uploadSessionId:randomUUID(),state:'active',version:1,sizeBytes:body.sizeBytes,partSizeBytes:RESUMABLE_LIMITS.partSizeBytes,
        partCount:Math.ceil(body.sizeBytes/RESUMABLE_LIMITS.partSizeBytes),expiresAt:body.expiresAt,acknowledgedBytes:0,parts:[],nextCursor:null}; sessions.set(s.uploadSessionId,s); }
      if(loseCreate){loseCreate=false;throw new TypeError('simulated lost create response');}
      return Response.json({...s,providerReference:'must-not-leak'});
    }
    if (p.includes('/by-key/')) return Response.json({state:'cancelled'});
    const s=sessions.get(id);
    if(!s) return Response.json({error:{code:'NOT_FOUND'}},{status:404});
    if(p.includes('/parts/')) {
      const bytes=await new Response(init.body).arrayBuffer();
      if(failPart){failPart=false;throw new TypeError('simulated interruption');}
      const part={partNumber:Number(p.split('/').at(-1)),sizeBytes:bytes.byteLength,sha256:init.headers.get('X-Part-SHA256')};
      if(!s.parts.some(p=>p.partNumber===part.partNumber)){s.parts.push(part);s.acknowledgedBytes+=part.sizeBytes;}
      return Response.json({...part,providerUploadId:'must-not-leak'});
    }
    if(init.method==='DELETE') s.state='cancelled';
    if(p.endsWith('/complete')) {s.state='completed';s.object={objectId:'logical-file',type:'file',name:'test.bin',parentId:null,sizeBytes:s.sizeBytes};}
    return Response.json({...s,providerReference:'must-not-leak'});
  };
  return {fetchImpl,calls,sessions,failPart:()=>{failPart=true;},loseCreate:()=>{loseCreate=true;}};
}
const createBody = {name:'test.bin',parentId:null,sizeBytes:3,mimeType:'application/octet-stream'};
const create = (f,key=randomUUID(),body=createBody) => f.request('',{method:'POST',headers:{'Idempotency-Key':key},body});
const digest=bytes=>createHash('sha256').update(bytes).digest('base64');
const put=(f,id,bytes=Buffer.from('abc'))=>f.request(`/${id}/parts/1`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Part-SHA256':digest(bytes)},body:bytes});

test('broker preserves ownership, streams parts, reconciles interruption and deduplicates completion/activity',async()=>{
  const mock=mockProvider(),f=await fixture(mock.fetchImpl);
  try {
    const key=randomUUID(),r=await create(f,key);
    assert.equal(r.status,201,await r.clone().text());
    const s=(await r.json()).data,id=s.transferId;
    assert.notEqual(id,[...mock.sessions.keys()][0]);
    assert.equal((await (await create(f,key)).json()).data.transferId,id);
    mock.failPart();
    assert.equal((await put(f,id)).status,503);
    assert.equal((await (await f.request(`/${id}`)).json()).data.acknowledgedBytes,0);
    assert.equal((await put(f,id)).status,200);
    const status=(await (await f.request(`/${id}`)).json()).data;
    assert.equal(status.parts.length,1);
    assert.equal(status.acknowledgedBytes,3);
    for(let i=0;i<2;i++) {
      const complete=await f.request(`/${id}/complete`,{method:'POST',body:{version:1}});
      assert.equal(complete.status,200,await complete.clone().text());
      assert.doesNotMatch(await complete.text(),/providerReference|providerUploadId|test-project|test-only-secret/);
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM activity_events WHERE action='upload'").get().n,1);
    assert.equal((await create(f,key,{...createBody,sizeBytes:4})).status,409);
  } finally {f.db.close();}
});

test('unchanged status polling does not rewrite broker rows but changed provider state is persisted',async()=>{
  const mock=mockProvider(),f=await fixture(mock.fetchImpl);
  try {
    const id=(await (await create(f)).json()).data.transferId;
    f.db.exec('CREATE TABLE broker_write_probe(n INTEGER); CREATE TRIGGER broker_write_probe AFTER UPDATE ON transfer_sessions BEGIN INSERT INTO broker_write_probe VALUES (1); END;');
    for(let i=0;i<3;i++) assert.equal((await f.request(`/${id}`)).status,200);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM broker_write_probe').get().n,0);
    [...mock.sessions.values()][0].state='paused';
    assert.equal((await f.request(`/${id}`)).status,200);
    assert.equal(f.db.prepare('SELECT state FROM transfer_sessions WHERE id=?').get(id).state,'paused');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM broker_write_probe').get().n,1);
  } finally {f.db.close();}
});

test('authorization gates include revoked assignments, readonly, maintenance, capability and creator-only cleanup',async()=>{
  const mock=mockProvider(),f=await fixture(mock.fetchImpl);
  try {
    const id=(await (await create(f)).json()).data.transferId;
    assert.equal((await f.request(`/${id}`,{token:'invalid'})).status,401);
    assert.equal((await f.request(`/${id}`,{token:f.otherSession.token})).status,404);
    assert.equal((await f.request(`/${id}`,{method:'DELETE',token:f.otherSession.token})).status,404);
    assert.equal((await f.request(`/${id}`,{method:'DELETE',headers:{Origin:'https://foreign.example'}})).status,403);
    f.db.prepare('UPDATE storage_access SET can_upload=0 WHERE user_id=?').run(f.user.id);
    assert.equal((await put(f,id)).status,403);
    assert.equal((await f.request(`/${id}/complete`,{method:'POST',body:{version:1}})).status,403);
    f.db.prepare('UPDATE storage_mounts SET read_only=1').run();
    f.db.prepare('DELETE FROM storage_access WHERE user_id=?').run(f.user.id);
    f.db.prepare("INSERT INTO system_settings(key,value,updated_at) VALUES ('maintenanceMode','true',1)").run();
    f.env.STORAGE_RESUMABLE_UPLOADS_ENABLED='false';
    assert.equal((await f.request(`/${id}`,{method:'DELETE'})).status,200);
    assert.equal([...mock.sessions.values()][0].state,'cancelled');
    assert.ok(!mock.calls.some(c=>c.p.endsWith('/complete')));
  } finally {f.db.close();}
});

test('feature defaults off, input validation and bounded exact-part streams fail closed',async()=>{
  const mock=mockProvider(),f=await fixture(mock.fetchImpl);
  try {
    delete f.env.STORAGE_RESUMABLE_UPLOADS_ENABLED;
    assert.equal((await create(f)).status,422);
    assert.equal(mock.calls.length,0);
    f.env.STORAGE_RESUMABLE_UPLOADS_ENABLED='true';
    for(const body of [{...createBody,sizeBytes:0},{...createBody,sizeBytes:10*1024**3+1},{...createBody,userId:f.user.id}]) assert.ok([400,413].includes((await create(f,randomUUID(),body)).status));
    const id=(await (await create(f)).json()).data.transferId;
    assert.equal((await f.request(`/${id}/parts/2`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Part-SHA256':digest(Buffer.from('abc'))},body:Buffer.from('abc')})).status,400);
    for(const bytes of [new Uint8Array(2),new Uint8Array(4)]) {
      const body=new ReadableStream({start(c){c.enqueue(bytes);c.close();}});
      await assert.rejects(new Response(exactPartStream(body,3)).arrayBuffer());
    }
  } finally {f.db.close();}
});

test('lost create acknowledgement recovers stable session and cancellation never requires creating a new upload',async()=>{
  const mock=mockProvider(),f=await fixture(mock.fetchImpl);
  try {
    mock.loseCreate();
    assert.equal((await create(f)).status,503);
    const row=f.db.prepare('SELECT * FROM transfer_sessions').get();
    assert.equal(row.shared_session_id,null);
    assert.equal((await f.request(`/${row.id}`)).status,200);
    assert.equal(mock.sessions.size,1);
    mock.loseCreate();
    assert.equal((await create(f)).status,503);
    const pending=f.db.prepare('SELECT * FROM transfer_sessions WHERE shared_session_id IS NULL').get();
    const before=mock.calls.filter(c=>c.p.endsWith('/uploads')).length;
    assert.equal((await f.request(`/${pending.id}`,{method:'DELETE'})).status,200);
    assert.equal(mock.calls.filter(c=>c.p.endsWith('/uploads')).length,before);
  } finally {f.db.close();}
});

// Opt-in bridge uses the actual Shared Hono routes/SQLite manager/Garage adapter.
// Only the S3 transport is mocked; no network, credentials or persistent DB is used.
test('Nexora → Shared Hono → real multipart adapter integration', { skip: !process.env.NEXORA_SHARED_STORAGE_ROOT }, async () => {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const root = pathToFileURL(resolve(process.env.NEXORA_SHARED_STORAGE_ROOT) + '/');
  process.env.DATABASE_PATH = ':memory:';
  const { db } = await import(new URL('src/db.js', root));
  const { applyMigrations } = await import(new URL('src/storage/migrations.js', root));
  const { createApp } = await import(new URL('src/app.js', root));
  const { createStorageManager } = await import(new URL('src/storage/manager.js', root));
  const { createProviderRegistry } = await import(new URL('src/storage/providers/index.js', root));
  const { createGarageProvider } = await import(new URL('src/storage/providers/garage.js', root));
  await applyMigrations(db);
  db.prepare("INSERT INTO apps(id,name) VALUES ('bridge-app','Test')").run();
  db.prepare('INSERT INTO app_credentials(id,app_id,secret_hash) VALUES (?,?,?)').run('bridge-credential','bridge-app',createHash('sha256').update('test-only-secret').digest('hex'));
  db.prepare("INSERT INTO projects(id,app_id,name,bucket) VALUES ('test-project','bridge-app','Test','test-only-bucket')").run();
  const parts=new Map();
  let completed=false;
  const commands=[];
  const s3={async send(command){
    const type=command.constructor.name,i=command.input;
    commands.push(type);
    switch(type){
      case 'ListMultipartUploadsCommand': return {Uploads:[]};
      case 'CreateMultipartUploadCommand': return {UploadId:'private-s3-id'};
      case 'UploadPartCommand': parts.set(i.PartNumber,{PartNumber:i.PartNumber,Size:i.Body.length,ETag:'test-etag'}); return {ETag:'test-etag'};
      case 'ListPartsCommand': return {Parts:[...parts.values()]};
      case 'HeadObjectCommand': if(!completed) throw Object.assign(new Error('missing'),{name:'NotFound'}); return {ContentLength:3,Metadata:{'upload-session':db.prepare('SELECT id FROM upload_sessions').get().id}};
      case 'CompleteMultipartUploadCommand': completed=true; return {ETag:'final-etag'};
      default: throw new Error(type);
    }
  }};
  const storage=createStorageManager(createProviderRegistry(createGarageProvider({s3})));
  const app=createApp({db,storage,bucket:'test-only-bucket',apiToken:'test-only-legacy',maxFileSize:25*1024**2,resumableUploads:true});
  const bridge=(url,init)=>app.request(new URL(url).pathname+new URL(url).search,{...init, ...(init.body instanceof ReadableStream?{duplex:'half'}:{})});
  const f=await fixture(bridge);
  try{
    const created=await create(f);
    assert.equal(created.status,201,await created.clone().text());
    const id=(await created.json()).data.transferId;
    assert.equal((await put(f,id)).status,200);
    const status=await f.request(`/${id}`);
    assert.equal(status.status,200,await status.clone().text());
    assert.equal((await status.json()).data.parts.length,1);
    const finish=()=>f.request(`/${id}/complete`,{method:'POST',body:{version:1}});
    const first=await finish();
    assert.equal(first.status,200,await first.clone().text());
    const object=(await first.json()).data.object;
    assert.equal((await (await finish()).json()).data.object.objectId,object.objectId);
    assert.equal(commands.filter(c=>c==='CompleteMultipartUploadCommand').length,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM storage_objects').get().n,1);
  }finally{f.db.close();db.close();}
});

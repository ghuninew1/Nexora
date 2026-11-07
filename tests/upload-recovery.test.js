import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadRecoveryStore, normalizeRecoveryRecord, matchesOriginalFile } from '../src/services/upload-recovery.js';
import { memoryIndexedDB } from './helpers/memory-indexeddb.js';
const record = (patch = {}) => ({ schemaVersion:1,id:'record_a',userScope:'user_a',transferId:'transfer_a',idempotencyKey:'stable_key',
  storageId:'storage_a',parentId:null,name:'file.bin',sizeBytes:10,mimeType:'application/octet-stream',lastModified:123,
  partSizeBytes:8*1024**2,partCount:1,createdAt:1000,expiresAt:9999999999999,updatedAt:2000,lastState:'paused',intent:'pause',...patch });

test('IndexedDB protocol CRUD preserves allowlisted metadata only, never source bytes/secrets', async () => {
  const db = memoryIndexedDB(), store = createUploadRecoveryStore({ indexedDB:db });
  await store.save(record({ blob:new Blob(['private bytes']),token:'must-not-persist',providerUploadId:'private',etag:'private' }));
  const rows = await store.list('user_a','storage_a');
  assert.deepEqual(rows,[record()]);
  assert.equal(JSON.stringify(db.rows()).includes('private'),false);
  await store.save(record({ lastState:'uploading',updatedAt:3000 }));
  assert.equal((await store.list('user_a','storage_a'))[0].lastState,'uploading');
  await store.remove('user_a','record_a'); assert.deepEqual(await store.list('user_a','storage_a'),[]);
  await store.close(); assert.equal(db.closed,true);
});

test('owner compound keys and owner-index queries isolate accounts and storages', async () => {
  const db=memoryIndexedDB(),store=createUploadRecoveryStore({indexedDB:db});
  await store.save(record()); await store.save(record({userScope:'user_b'}));
  await store.save(record({id:'other_mount',storageId:'storage_b'}));
  await store.remove('user_b','record_a');
  assert.equal((await store.list('user_a','storage_a')).length,1);
  assert.equal((await store.list('user_a','storage_b')).length,1);
  assert.deepEqual(await store.list('replacement_account','storage_a'),[]);
  assert.ok(db.scopes.every(scope=>['user_a','user_b','replacement_account'].includes(scope)));
});

test('schema/geometry validation rejects corrupt records and strips unknown fields', () => {
  for (const patch of [{schemaVersion:2},{userScope:'email@example.test'},{sizeBytes:0},{partSizeBytes:4},{partCount:2},
    {lastModified:-1},{expiresAt:999},{lastState:'completed'},{intent:'upload'},{transferId:'physical/path'},{mimeType:'unsafe\nvalue'}]) {
    assert.throws(()=>normalizeRecoveryRecord(record(patch)),{code:'INVALID_RECORD'});
  }
  assert.equal(normalizeRecoveryRecord(record({transferId:null})).transferId,null);
  assert.equal(matchesOriginalFile(record(),{name:'file.bin',size:10,lastModified:123,slice(){}}),true);
  for(const file of [{name:'other',size:10,lastModified:123},{name:'file.bin',size:9,lastModified:123},{name:'file.bin',size:10,lastModified:124}]) {
    assert.equal(matchesOriginalFile(record(),{...file,slice(){}}),false);
  }
});

test('bounded retention prunes only known owner records and ignores future schemas', async () => {
  const db=memoryIndexedDB(),store=createUploadRecoveryStore({indexedDB:db,maxRecords:2});
  db.seed(record({userScope:'user_b'}));
  db.seed(record({id:'future',schemaVersion:2}));
  db.seed(record({id:'corrupt',partCount:5}));
  for(let n=0;n<4;n++) await store.save(record({id:'row_'+n,updatedAt:n}));
  assert.deepEqual((await store.list('user_a','storage_a')).map(r=>r.id),['row_3','row_2']);
  assert.ok(db.rows().some(r=>r.userScope==='user_b'));
  assert.ok(db.rows().some(r=>r.schemaVersion===2));
  assert.ok(!db.rows().some(r=>r.id==='corrupt'));
});

test('quota/open failure and unavailable/corrupt API fail safely with bounded wait', async () => {
  const db=memoryIndexedDB(),store=createUploadRecoveryStore({indexedDB:db});
  db.failWrite=true;
  await assert.rejects(store.save(record()),{code:'QUOTA_EXCEEDED'});
  db.failWrite=false; await store.save(record());
  assert.equal((await store.list('user_a','storage_a')).length,1);
  await assert.rejects(createUploadRecoveryStore({indexedDB:null}).list('user_a','storage_a'),{code:'UNAVAILABLE'});
  await assert.rejects(createUploadRecoveryStore({indexedDB:{open(){throw new Error('corrupt');}}}).list('user_a','storage_a'),{code:'UNAVAILABLE'});
  await assert.rejects(createUploadRecoveryStore({indexedDB:{open(){return {}; }},timeoutMs:5}).list('user_a','storage_a'),{code:'UNAVAILABLE'});
});

test('serialized deletion wins against older pending saves, without touching another account', async () => {
  const db=memoryIndexedDB(),store=createUploadRecoveryStore({indexedDB:db});
  const writes=[store.save(record()),store.save(record({lastState:'cancelling',intent:'cancel'})),store.remove('user_a','record_a')];
  await Promise.all(writes);
  assert.deepEqual(await store.list('user_a','storage_a'),[]);
});

test('invalid retention configuration cannot accidentally clear all records', () => {
  for(const maxRecords of [0,-1,51,NaN]) assert.throws(()=>createUploadRecoveryStore({maxRecords}),{code:'INVALID_OPTIONS'});
});

import { check, fingerprint } from './support.mjs';

export const MARKER_KEY = '.__nexora_acceptance_owner__';
export async function inventory(send, sdk, bucket) {
  const keys=[], uploads=[];
  let continuation, keyMarker, uploadMarker;
  for (let pages=0;;pages++) {
    check(pages<100,'INVENTORY_PAGE_LIMIT');
    const page=await send(new sdk.ListObjectsV2Command({Bucket:bucket,ContinuationToken:continuation,MaxKeys:1000}));
    for(const o of page.Contents || []) keys.push(o.Key);
    if(!page.IsTruncated)break;
    check(page.NextContinuationToken && page.NextContinuationToken!==continuation,'INVALID_INVENTORY_CURSOR');
    continuation=page.NextContinuationToken;
  }
  for(let pages=0;;pages++) {
    check(pages<100,'INVENTORY_PAGE_LIMIT');
    const page=await send(new sdk.ListMultipartUploadsCommand({Bucket:bucket,KeyMarker:keyMarker,UploadIdMarker:uploadMarker,MaxUploads:1000}));
    uploads.push(...(page.Uploads || []));
    if(!page.IsTruncated)break;
    check(page.NextKeyMarker && (page.NextKeyMarker!==keyMarker || page.NextUploadIdMarker!==uploadMarker),'INVALID_INVENTORY_CURSOR');
    keyMarker=page.NextKeyMarker;uploadMarker=page.NextUploadIdMarker;
  }
  return {keys,uploads};
}
export async function requireEmptyBucket(send,sdk,bucket) {
  await send(new sdk.HeadBucketCommand({Bucket:bucket}));
  const found=await inventory(send,sdk,bucket);
  check(found.keys.length===0 && found.uploads.length===0,'BUCKET_NOT_EMPTY_NO_WRITES_ALLOWED');
}
export async function markerMatches(send,sdk,bucket,journal) {
  const response=await send(new sdk.GetObjectCommand({Bucket:bucket,Key:MARKER_KEY}));
  let text='';
  for await(const chunk of response.Body) {
    text+=chunk.toString('utf8');
    check(text.length<=4096,'INVALID_OWNERSHIP_MARKER');
  }
  const value=JSON.parse(text);
  check(value.runId===journal.runId && value.token===journal.markerToken,'OWNERSHIP_MARKER_MISMATCH');
}
export async function cleanOwnedResources(send,sdk,config,journal,{removeMarker=false}={}) {
  check(journal.scopeFingerprint===fingerprint(config.endpoint,config.bucket),'JOURNAL_SCOPE_MISMATCH');
  check(journal.objects && typeof journal.objects==='object' && !Array.isArray(journal.objects)
    && Object.entries(journal.objects).every(([key,value])=>/^[0-9a-f-]{36}$/iu.test(key) && /^[0-9a-f-]{36}$/iu.test(value?.sessionId || '')), 'INVALID_PRIVATE_JOURNAL');
  await markerMatches(send,sdk,config.bucket,journal);
  const before=await inventory(send,sdk,config.bucket);
  const owned=new Set(Object.keys(journal.objects));
  // Unknown keys/MPUs stop teardown entirely. Never empty a bucket recursively.
  check(before.keys.every(key=>key===MARKER_KEY || owned.has(key)) && before.uploads.every(u=>owned.has(u.Key)), 'FOREIGN_RESOURCE_DETECTED');
  for(const u of before.uploads) await send(new sdk.AbortMultipartUploadCommand({Bucket:config.bucket,Key:u.Key,UploadId:u.UploadId}));
  for(const key of before.keys) if(key!==MARKER_KEY) await send(new sdk.DeleteObjectCommand({Bucket:config.bucket,Key:key}));
  const after=await inventory(send,sdk,config.bucket);
  check(after.uploads.length===0 && after.keys.every(key=>key===MARKER_KEY),'ORPHANS_REMAIN_AFTER_CLEANUP');
  if(removeMarker) {
    await send(new sdk.DeleteObjectCommand({Bucket:config.bucket,Key:MARKER_KEY}));
    const empty=await inventory(send,sdk,config.bucket);
    check(empty.keys.length===0 && empty.uploads.length===0,'FINAL_BUCKET_NOT_EMPTY');
  }
  return {remainingObjects:0,remainingMultipartUploads:0};
}

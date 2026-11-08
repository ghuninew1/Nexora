const MAX_FILE_BYTES = 5_000_000_000;
const SMALL_FILE_MAX = 25 * 1024 ** 2;

// Mirrors the currently compatible public v1 limits; never widens the legacy cap.
export function selectUploadStrategy(sizeBytes, maxUploadBytes, transfers) {
  const smallLimit = Number.isSafeInteger(maxUploadBytes) && maxUploadBytes >= 0
    ? Math.min(maxUploadBytes, SMALL_FILE_MAX) : SMALL_FILE_MAX;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { error: 'INVALID_INPUT', smallLimit };
  if (sizeBytes > MAX_FILE_BYTES) return { error: 'UPLOAD_TOO_LARGE', smallLimit };
  if (sizeBytes <= smallLimit) return { strategy: 'legacy', smallLimit };
  const limits = ['maxFileBytes', 'partSizeBytes', 'maxParts', 'maxParallelParts', 'sessionTtlSeconds'];
  const compatible = transfers?.resumableUpload === true
    && limits.every(key => Number.isSafeInteger(transfers[key]) && transfers[key] > 0)
    && transfers.partSizeBytes === 8 * 1024 ** 2 && transfers.maxParallelParts === 1
    && transfers.maxFileBytes <= 10 * 1024 ** 3 && transfers.maxParts <= 1280
    && Math.ceil(transfers.maxFileBytes / transfers.partSizeBytes) <= transfers.maxParts;
  // maxUploadBytes is the direct-request limit, not the multipart file limit.
  // Missing/disabled/incompatible multipart support is a readiness failure.
  if (!compatible) return { error: 'MULTIPART_UNAVAILABLE', smallLimit };
  if (sizeBytes > transfers.maxFileBytes) return { error: 'UPLOAD_TOO_LARGE', smallLimit };
  return { strategy: 'multipart', smallLimit, limits: Object.fromEntries(limits.map(key => [key, transfers[key]])) };
}

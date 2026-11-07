# Large file transfer — frontend status

Phase 4 is **incomplete**. The storage capability normalizer retains explicitly advertised resumable-upload limits only when all required limits are positive safe integers and their geometry is consistent. Missing, disabled or malformed transfer data does not enable resumable uploads; unknown fields are discarded. This is capability groundwork only and does not initiate multipart requests.

The existing File Browser queue still uses the small-file upload endpoint and keeps files in memory for the lifetime of its component. It does not provide a global Transfer Manager, multipart uploads, IndexedDB recovery, file reselection, cross-tab coordination, pause/resume, acknowledged-byte progress or network recovery. Do not enable the feature or represent Phase 4 as complete on the basis of this change.

Future implementation must retain the idempotency key before session creation, reconcile ambiguous outcomes against the same session, verify all paginated receipts and reselected-file part digests, and coordinate active sessions across tabs. Authentication changes must abort active work and isolate persisted metadata by account. Browser and real-provider acceptance remain outstanding; see [backend contract](LARGE_FILE_TRANSFER_BACKEND.md) and [acceptance report](LARGE_FILE_TRANSFER_ACCEPTANCE.md).

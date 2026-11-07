-- Additive, metadata-only upload broker. Apply only to an explicitly approved target.
CREATE TABLE transfer_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_id TEXT NOT NULL REFERENCES storage_mounts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  request_key_hash TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  shared_session_id TEXT,
  name TEXT NOT NULL,
  parent_id TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  state TEXT NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','active','paused','completing','completed','cancelling','cancelled','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(user_id, storage_id, request_key_hash)
);
CREATE INDEX transfer_sessions_owner ON transfer_sessions(user_id, storage_id, created_at, id);

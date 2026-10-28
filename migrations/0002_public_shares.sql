CREATE TABLE public_shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_mount_id TEXT NOT NULL REFERENCES storage_mounts(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX public_shares_active_object ON public_shares(user_id, storage_mount_id, object_id) WHERE revoked_at IS NULL;
CREATE INDEX public_shares_owner_created ON public_shares(user_id, created_at DESC, id);

-- Membership is additive groundwork. Existing owner authorization remains in force
-- until all storage, sharing and metadata routes are switched together.
CREATE TABLE storage_access (
  storage_id TEXT NOT NULL REFERENCES storage_mounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_read INTEGER NOT NULL DEFAULT 0 CHECK (can_read IN (0, 1)),
  can_preview INTEGER NOT NULL DEFAULT 0 CHECK (can_preview IN (0, 1)),
  can_download INTEGER NOT NULL DEFAULT 0 CHECK (can_download IN (0, 1)),
  can_upload INTEGER NOT NULL DEFAULT 0 CHECK (can_upload IN (0, 1)),
  can_create_folder INTEGER NOT NULL DEFAULT 0 CHECK (can_create_folder IN (0, 1)),
  can_rename INTEGER NOT NULL DEFAULT 0 CHECK (can_rename IN (0, 1)),
  can_move INTEGER NOT NULL DEFAULT 0 CHECK (can_move IN (0, 1)),
  can_copy INTEGER NOT NULL DEFAULT 0 CHECK (can_copy IN (0, 1)),
  can_delete INTEGER NOT NULL DEFAULT 0 CHECK (can_delete IN (0, 1)),
  can_permanent_delete INTEGER NOT NULL DEFAULT 0 CHECK (can_permanent_delete IN (0, 1)),
  can_share INTEGER NOT NULL DEFAULT 0 CHECK (can_share IN (0, 1)),
  can_manage_share INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_share IN (0, 1)),
  can_favorite INTEGER NOT NULL DEFAULT 0 CHECK (can_favorite IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, storage_id),
  CHECK (can_read = 1 OR (can_preview = 0 AND can_download = 0 AND can_favorite = 0)),
  CHECK (can_delete = 1 OR can_permanent_delete = 0),
  CHECK (can_share = 1 OR can_manage_share = 0)
);
CREATE INDEX storage_access_storage ON storage_access(storage_id, user_id);

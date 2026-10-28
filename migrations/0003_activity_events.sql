PRAGMA foreign_keys = ON;

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_mount_id TEXT,
  storage_name TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'upload', 'create_folder', 'rename', 'move', 'copy', 'trash', 'restore',
    'delete_permanent', 'favorite', 'unfavorite', 'share_create', 'share_replace', 'share_revoke'
  )),
  object_id TEXT,
  object_name TEXT,
  object_type TEXT CHECK (object_type IS NULL OR object_type IN ('file', 'folder')),
  parent_id TEXT,
  destination_parent_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_activity_events_user_created
ON activity_events(user_id, created_at DESC, id DESC);

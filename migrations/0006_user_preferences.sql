CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark',
  file_sort TEXT NOT NULL DEFAULT 'name',
  file_sort_direction TEXT NOT NULL DEFAULT 'asc',
  confirm_delete INTEGER NOT NULL DEFAULT 1,
  upload_conflict_behavior TEXT NOT NULL DEFAULT 'ask',
  upload_concurrency INTEGER NOT NULL DEFAULT 3,
  auto_clear_uploads INTEGER NOT NULL DEFAULT 1,
  default_storage_id TEXT REFERENCES storage_mounts(id) ON DELETE SET NULL,
  share_expiration TEXT NOT NULL DEFAULT '7d',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

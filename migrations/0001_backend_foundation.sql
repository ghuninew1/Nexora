PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0, 1))
);
CREATE INDEX login_attempts_recent ON login_attempts(email_hash, ip_hash, attempted_at);

CREATE TABLE storage_mounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('garage')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
  shared_storage_project_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_user_id, name)
);
CREATE INDEX storage_mounts_owner ON storage_mounts(owner_user_id, status, name);

CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_mount_id TEXT NOT NULL REFERENCES storage_mounts(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, storage_mount_id, object_id)
);
CREATE INDEX favorites_user_created ON favorites(user_id, created_at DESC);

CREATE TABLE recent_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_mount_id TEXT NOT NULL REFERENCES storage_mounts(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  accessed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, storage_mount_id, object_id)
);
CREATE INDEX recent_access_user_time ON recent_access(user_id, accessed_at DESC);

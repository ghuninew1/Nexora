-- Preserve existing mount owners before membership authorization is enabled.
-- Existing assignments, including deliberately restricted ones, are untouched.
ALTER TABLE storage_access ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1));
CREATE UNIQUE INDEX storage_access_one_default ON storage_access(user_id) WHERE is_default = 1;

INSERT OR IGNORE INTO storage_access (
  storage_id, user_id, can_read, can_preview, can_download, can_upload,
  can_create_folder, can_rename, can_move, can_copy, can_delete,
  can_permanent_delete, can_share, can_manage_share, can_favorite,
  created_at, updated_at, created_by
)
SELECT id, owner_user_id, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  created_at, updated_at, NULL
FROM storage_mounts;

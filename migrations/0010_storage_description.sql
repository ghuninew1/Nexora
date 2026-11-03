-- Optional Nexora-owned display metadata; existing identifiers and assignments are untouched.
ALTER TABLE storage_mounts ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Existing links cannot be recovered from their hash and must be replaced.
ALTER TABLE public_shares ADD COLUMN encrypted_secret TEXT;

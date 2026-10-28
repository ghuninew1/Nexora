ALTER TABLE public_shares ADD COLUMN expires_at INTEGER;
CREATE INDEX public_shares_expiry ON public_shares(expires_at) WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

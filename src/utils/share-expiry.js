const MAX_TIMEOUT_MS = 2_147_483_647;

export function nextShareExpiryDelay(shares, now) {
  const expiries = shares.map((share) => Date.parse(share.expiresAt || ''))
    .filter((value) => Number.isFinite(value) && value > now);
  if (!expiries.length) return null;
  return Math.min(MAX_TIMEOUT_MS, Math.min(...expiries) - now + 1);
}

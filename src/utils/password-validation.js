export function validatePasswordConfirmation(password, confirmation) {
  if (password !== confirmation) return 'New passwords do not match.';
  if (new TextEncoder().encode(password).length < 12) return 'New password must be at least 12 UTF-8 bytes.';
  return '';
}

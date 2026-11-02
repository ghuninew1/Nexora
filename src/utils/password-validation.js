export function validatePasswordConfirmation(password, confirmation, policy = { passwordMinLength: 12, strongPasswordRequired: false }) {
  if (password !== confirmation) return 'New passwords do not match.';
  if (new TextEncoder().encode(password).length < policy.passwordMinLength) return `New password must be at least ${policy.passwordMinLength} UTF-8 bytes.`;
  if (policy.strongPasswordRequired && (!/[a-z]/u.test(password) || !/[A-Z]/u.test(password) || !/[0-9]/u.test(password))) return 'Use lowercase, uppercase and a number.';
  return '';
}

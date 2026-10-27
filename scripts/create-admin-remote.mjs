import { randomUUID } from 'node:crypto';
import { normalizeDisplayName, normalizeEmail, validateNewUserPassword } from '../functions/_lib/auth.js';
import { hashPassword } from '../functions/_lib/password.js';
import { adminInsertSql, executeProductionSql, requiredEnvironmentValue } from './lib/production-provisioning.js';

async function main() {
  const emailInput = requiredEnvironmentValue(process.env, 'NEXORA_ADMIN_EMAIL');
  const displayNameInput = requiredEnvironmentValue(process.env, 'NEXORA_ADMIN_DISPLAY_NAME');
  let passwordInput = requiredEnvironmentValue(process.env, 'NEXORA_ADMIN_PASSWORD');

  let email;
  let displayName;
  let password;
  delete process.env.NEXORA_ADMIN_EMAIL;
  delete process.env.NEXORA_ADMIN_DISPLAY_NAME;
  delete process.env.NEXORA_ADMIN_PASSWORD;
  try {
    email = normalizeEmail(emailInput);
    displayName = normalizeDisplayName(displayNameInput);
    password = validateNewUserPassword(passwordInput);
    passwordInput = '';
  } catch {
    passwordInput = '';
    throw new Error('Admin input is invalid. Check email, display name, and password requirements.');
  }
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  password = '';
  const rowsWritten = await executeProductionSql(adminInsertSql({
    id,
    email,
    displayName,
    passwordHash,
    now: Date.now(),
  }));
  if (rowsWritten !== 1) throw new Error('An account with this normalized email already exists; no admin was created.');

  console.log(`Production admin created: ${JSON.stringify({ id, email, displayName, role: 'admin' })}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Production admin provisioning failed.');
  process.exitCode = 1;
});

import { randomUUID } from 'node:crypto';
import { normalizeEmail } from '../functions/_lib/auth.js';
import {
  executeProductionSql,
  requiredEnvironmentValue,
  storageMountInsertSql,
  validateStorageName,
  validateStorageProjectId,
} from './lib/production-provisioning.js';

async function main() {
  let email;
  let name;
  let projectId;
  try {
    email = normalizeEmail(requiredEnvironmentValue(process.env, 'NEXORA_USER_EMAIL'));
    projectId = validateStorageProjectId(requiredEnvironmentValue(process.env, 'NEXORA_STORAGE_PROJECT_ID'));
    name = validateStorageName(requiredEnvironmentValue(process.env, 'NEXORA_STORAGE_NAME'));
  } catch {
    throw new Error('Storage mount input is invalid. Check the email, project ID, and storage name.');
  }
  delete process.env.NEXORA_USER_EMAIL;
  delete process.env.NEXORA_STORAGE_PROJECT_ID;
  delete process.env.NEXORA_STORAGE_NAME;

  const id = randomUUID();
  const rowsWritten = await executeProductionSql(storageMountInsertSql({
    id,
    email,
    name,
    projectId,
    now: Date.now(),
  }));
  if (rowsWritten !== 1) {
    throw new Error('No mount was created. The user may be missing or inactive, or this user already has a mount with the same name or project.');
  }

  console.log(`Production storage mount created: ${JSON.stringify({ id, ownerEmail: email, name, provider: 'garage', status: 'active' })}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Production storage mount provisioning failed.');
  process.exitCode = 1;
});

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PRODUCTION_DATABASE = 'nexora-db';

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function validateStorageProjectId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('NEXORA_STORAGE_PROJECT_ID must be 1–128 letters, numbers, underscores, or hyphens.');
  }
  return value;
}

export function validateStorageName(value) {
  if (typeof value !== 'string') throw new Error('NEXORA_STORAGE_NAME must be a string.');
  const name = value.trim();
  const hasControlCharacter = [...name].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 32 || codePoint === 127;
  });
  if (!name || name.length > 120 || hasControlCharacter) {
    throw new Error('NEXORA_STORAGE_NAME must be 1–120 characters and contain no control characters.');
  }
  return name;
}

export function adminInsertSql({ id, email, displayName, passwordHash, now }) {
  return `INSERT INTO users (id, email, display_name, password_hash, role, active, created_at, updated_at)
SELECT ${sqlString(id)}, ${sqlString(email)}, ${sqlString(displayName)}, ${sqlString(passwordHash)}, 'admin', 1, ${now}, ${now}
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${sqlString(email)} COLLATE NOCASE);`;
}

export function storageMountInsertSql({ id, email, name, projectId, now }) {
  return `INSERT INTO storage_mounts (id, owner_user_id, name, provider, status, read_only, shared_storage_project_id, created_at, updated_at)
SELECT ${sqlString(id)}, users.id, ${sqlString(name)}, 'garage', 'active', 0, ${sqlString(projectId)}, ${now}, ${now}
FROM users
WHERE users.email = ${sqlString(email)} COLLATE NOCASE
  AND users.active = 1
  AND NOT EXISTS (
    SELECT 1 FROM storage_mounts
    WHERE owner_user_id = users.id
      AND (lower(name) = lower(${sqlString(name)}) OR shared_storage_project_id = ${sqlString(projectId)})
  );`;
}

export function remoteWranglerArgs(filePath) {
  return ['exec', 'wrangler', 'd1', 'execute', PRODUCTION_DATABASE, '--remote', '--json', `--file=${filePath}`];
}

export function parseRowsWritten(stdout) {
  const result = JSON.parse(stdout.trim());
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true) {
    throw new Error('Unexpected Wrangler D1 result.');
  }
  const rowsWritten = Number(result[0]?.meta?.rows_written);
  if (!Number.isSafeInteger(rowsWritten) || rowsWritten < 0) throw new Error('Missing D1 write count.');
  return rowsWritten;
}

export async function executeProductionSql(sql) {
  const directory = await mkdtemp(join(tmpdir(), 'nexora-provision-'));
  const filePath = join(directory, 'statement.sql');
  try {
    await writeFile(filePath, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const args = remoteWranglerArgs(filePath);
    const output = await new Promise((resolve, reject) => {
      const child = spawn('pnpm', args, {
        cwd: process.cwd(),
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let outputBytes = 0;
      let oversized = false;
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', (chunk) => {
          outputBytes += chunk.length;
          if (outputBytes > 64 * 1024) {
            oversized = true;
            child.kill();
          } else if (stream === child.stdout) {
            stdout += chunk.toString();
          }
        });
      }
      child.on('error', () => reject(new Error('Unable to start the remote provisioning command.')));
      child.on('close', (code) => {
        if (oversized) return reject(new Error('Remote provisioning returned an unexpected response.'));
        if (code !== 0) return reject(new Error('Remote provisioning failed. Check production D1 and the configured Wrangler account.'));
        try {
          resolve(parseRowsWritten(stdout));
        } catch {
          reject(new Error('Remote provisioning returned an unexpected response.'));
        }
      });
    });
    return output;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function requiredEnvironmentValue(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Set ${name} in the private process environment.`);
  return value;
}

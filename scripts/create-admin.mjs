import { randomBytes, randomUUID, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runPbkdf2 = promisify(pbkdf2);
const email = process.env.NEXORA_ADMIN_EMAIL?.trim().toLowerCase();
const displayName = process.env.NEXORA_ADMIN_DISPLAY_NAME?.trim();
const password = process.env.NEXORA_ADMIN_PASSWORD;
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error('Set a valid NEXORA_ADMIN_EMAIL.');
if (!displayName || displayName.length > 120) throw new Error('Set NEXORA_ADMIN_DISPLAY_NAME (1–120 characters).');
if (!password || Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 1024) {
  throw new Error('Set NEXORA_ADMIN_PASSWORD to a unique password of 12–1024 UTF-8 bytes.');
}

const salt = randomBytes(16);
const digest = await runPbkdf2(password, salt, 600_000, 32, 'sha256');
const passwordHash = `pbkdf2-sha256$600000$${salt.toString('base64url')}$${digest.toString('base64url')}`;
delete process.env.NEXORA_ADMIN_PASSWORD;
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const now = Date.now();
const sql = `INSERT INTO users (id,email,display_name,password_hash,role,active,created_at,updated_at) VALUES (${sqlString(randomUUID())},${sqlString(email)},${sqlString(displayName)},${sqlString(passwordHash)},'admin',1,${now},${now});\n`;
const directory = await mkdtemp(join(tmpdir(), 'nexora-admin-'));
const file = join(directory, 'provision.sql');
try {
  await writeFile(file, sql, { mode: 0o600 });
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await new Promise((resolve, reject) => {
    const child = spawn(command, ['exec', 'wrangler', 'd1', 'execute', 'nexora-local', '--local', `--file=${file}`], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Local admin provisioning exited with status ${code}.`)));
  });
  process.stdout.write('Created one local Nexora admin. This command is hard-coded to the local D1 database.\n');
} finally {
  delete process.env.NEXORA_ADMIN_PASSWORD;
  await rm(directory, { recursive: true, force: true });
}

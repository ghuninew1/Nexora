import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDisplayName, normalizeEmail, validateNewUserPassword } from '../functions/_lib/auth.js';
import { hashPassword } from '../functions/_lib/password.js';

const emailInput = process.env.NEXORA_ADMIN_EMAIL;
const displayNameInput = process.env.NEXORA_ADMIN_DISPLAY_NAME;
let password = process.env.NEXORA_ADMIN_PASSWORD;
delete process.env.NEXORA_ADMIN_EMAIL;
delete process.env.NEXORA_ADMIN_DISPLAY_NAME;
delete process.env.NEXORA_ADMIN_PASSWORD;

let email;
let displayName;
try {
  email = normalizeEmail(emailInput);
  displayName = normalizeDisplayName(displayNameInput);
  password = validateNewUserPassword(password);
} catch {
  password = '';
  throw new Error('Admin input is invalid. Check email, display name, and password requirements.');
}

let passwordHash;
try {
  passwordHash = await hashPassword(password);
} finally {
  password = '';
}
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const now = Date.now();
const sql = `INSERT INTO users (id,email,display_name,password_hash,role,active,created_at,updated_at) VALUES (${sqlString(randomUUID())},${sqlString(email)},${sqlString(displayName)},${sqlString(passwordHash)},'admin',1,${now},${now});\n`;
const directory = await mkdtemp(join(tmpdir(), 'nexora-admin-'));
const file = join(directory, 'provision.sql');
try {
  await writeFile(file, sql, { mode: 0o600 });
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await new Promise((resolve, reject) => {
    const child = spawn(command, ['exec', 'wrangler', 'd1', 'execute', 'nexora-db', '--local', `--file=${file}`], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Local admin provisioning exited with status ${code}.`)));
  });
  process.stdout.write('Created one local Nexora admin. This command is hard-coded to the local D1 database.\n');
} finally {
  delete process.env.NEXORA_ADMIN_PASSWORD;
  await rm(directory, { recursive: true, force: true });
}

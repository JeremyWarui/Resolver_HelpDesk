// The e2e suite's own Django: a fresh SQLite file, migrated and seeded, served
// on E2E_API_PORT. The developer's database is never touched.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const password = process.env.E2E_PASSWORD;
if (!password) {
  console.error('E2E_PASSWORD is not set: the seeded accounts need it as their password.');
  process.exit(1);
}

const port = process.env.E2E_API_PORT ?? '8001';
const backend = resolve(import.meta.dirname, '../../backend');
const python = resolve(backend, process.platform === 'win32' ? '../venv/Scripts/python.exe' : '../venv/bin/python');
const file = join(tmpdir(), 'resolver-e2e.sqlite3');
// Each email is written here as a file; helpers.ts reads the same folder.
const MAIL_DIR = join(tmpdir(), 'resolver-e2e-mail');
const origins = ['5174', '4174'].flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]).join(',');

const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${file.replaceAll('\\', '/')}`,
  SEED_DEFAULT_PASSWORD: password,
  CORS_ALLOWED_ORIGINS: origins,
  CSRF_TRUSTED_ORIGINS: origins,
  EMAIL_BACKEND: 'django.core.mail.backends.filebased.EmailBackend',
  EMAIL_FILE_PATH: MAIL_DIR,
  FRONTEND_URL: 'http://localhost:5174',
  // Blank, not absent: `backend/.env` may set it, and the env var wins over the file.
  EMAIL_SEND_ONLY_TO: '',
};

rmSync(file, { force: true });
rmSync(MAIL_DIR, { recursive: true, force: true });
for (const args of [['migrate', '--no-input'], ['seed']]) {
  const run = spawnSync(python, ['manage.py', ...args], { cwd: backend, env, stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

const server = spawn(python, ['manage.py', 'runserver', port, '--noreload'], { cwd: backend, env, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));

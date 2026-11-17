import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import test from 'node:test';

/**
 * Reglas estaticas de Platform Admin (P0-D):
 *  - /platform y /api/platform no dependen de los entitlements del workspace
 *    activo (son funciones de PLATAFORMA).
 *  - /platform nunca lee contactos ni conversaciones de un cliente: eso exige
 *    una SupportSession explicita.
 *  - Nada de consultas cross-tenant fuera de lib/platform.
 */

function files(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const root = process.cwd();
const posix = (file: string) => file.split(sep).join('/');
const platformFiles = [
  ...files(join(root, 'src/app/platform')),
  ...files(join(root, 'src/app/api/platform')),
  ...files(join(root, 'src/lib/platform')).filter((f) => !f.endsWith('.test.ts')),
];

test('/platform no depende de entitlements del workspace', () => {
  const offenders = platformFiles.filter((file) => {
    const text = readFileSync(file, 'utf8');
    // lib/platform/http.ts solo traduce el tipo de error a HTTP.
    if (posix(file).endsWith('src/lib/platform/http.ts')) return false;
    return /from ['"](@\/lib|\.\.?\/.*)\/entitlements(\/[^'"]*)?['"]/.test(text) || /getWorkspaceEntitlements|assertFeature|assertCanGrow/.test(text);
  });
  assert.deepEqual(offenders, []);
});

test('/platform no lee contactos ni conversaciones de clientes', () => {
  const offenders = platformFiles.filter((file) => /\.(contact|conversation|message)\.(find|count|aggregate|group)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('las paginas y APIs de plataforma no usan crossTenantPrisma directo (va en lib/platform)', () => {
  const pages = platformFiles.filter((file) => !posix(file).includes('/src/lib/platform/'));
  const offenders = pages.filter((file) => /crossTenantPrisma|withPlatformScope/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

// ----------------------------------------------------------------------------
// Ultimo SUPER_ADMIN: la variante acotada existe solo para tests.

function sourceFiles(dir: string) {
  return files(join(root, dir)).filter((f) => !f.endsWith('.test.ts'));
}

test('setPlatformRoleInScopeForTests solo se usa desde scripts de prueba', () => {
  const offenders = [...sourceFiles('src'), ...files(join(root, 'scripts'))].filter((file) => {
    const p = posix(file);
    if (p.endsWith('src/lib/platform/roles.ts')) return false;
    if (/\/scripts\/smoke-[^/]+\.ts$/.test(p)) return false;
    return readFileSync(file, 'utf8').includes('setPlatformRoleInScopeForTests');
  });
  assert.deepEqual(offenders, []);
});

test('UI y CLI cuentan SUPER_ADMIN sobre toda la plataforma, bajo el lock', () => {
  const text = readFileSync(join(root, 'src/lib/platform/roles.ts'), 'utf8');
  assert.match(text, /const PRODUCTION_SCOPE: SuperAdminScope = null;/);
  const prod = text.slice(text.indexOf('export async function setPlatformRole('), text.indexOf('type SuperAdminScope'));
  assert.equal((prod.match(/PRODUCTION_SCOPE,?\s*\)/g) ?? []).length, 2, 'setPlatformRole y setPlatformRoleFromCli usan PRODUCTION_SCOPE');
  assert.match(text, /pg_advisory_xact_lock\(hashtextextended\('platform:roles', 0\)\)/);
  const cli = readFileSync(join(root, 'scripts/platform-admin.ts'), 'utf8');
  assert.match(cli, /setPlatformRoleFromCli/);
  assert.doesNotMatch(cli, /platformRole: role/, 'el CLI no escribe el rol por fuera del lock');
});

// ----------------------------------------------------------------------------
// Recuperacion de contrasena: identidad global, email de plataforma.

test('password reset: la ruta solo devuelve la respuesta publica (nunca el token)', () => {
  const route = readFileSync(join(root, 'src/app/api/auth/password-reset/route.ts'), 'utf8');
  assert.doesNotMatch(route, /devToken|issued|\.token\b/);
  const responses = route.match(/NextResponse\.json\([^\n]*\)/g) ?? [];
  assert.deepEqual(responses, [
    'NextResponse.json(PASSWORD_RESET_PUBLIC_RESPONSE)',
    'NextResponse.json(await requestPasswordReset(email, { schedule: after }))',
  ]);
  const lib = readFileSync(join(root, 'src/lib/password-reset.ts'), 'utf8');
  const request = lib.slice(lib.indexOf('export async function requestPasswordReset('), lib.indexOf('export const PASSWORD_RESET_EMAIL_ATTEMPTS'));
  assert.match(request, /return PASSWORD_RESET_PUBLIC_RESPONSE;\s*\}\s*$/);
  assert.equal((request.match(/return /g) ?? []).length, 1, 'un unico return: la respuesta publica');
});

test('password reset: el envio va con after() de Next, sin promesas sueltas', () => {
  const route = readFileSync(join(root, 'src/app/api/auth/password-reset/route.ts'), 'utf8');
  assert.match(route, /import \{ after, NextResponse \} from 'next\/server'/);
  assert.match(route, /schedule: after/);
  const lib = readFileSync(join(root, 'src/lib/password-reset.ts'), 'utf8');
  for (const [file, text] of [['route', route], ['lib', lib]] as const) {
    assert.doesNotMatch(text, /\bvoid\s+[\w.]+\(/, `${file}: sin "void promesa()"`);
    assert.doesNotMatch(text, /\.then\(|setTimeout|setImmediate|process\.nextTick/, `${file}: sin fire-and-forget`);
  }
});

test('password reset: usa el email de plataforma y no la cuota del tenant ni el workspace', () => {
  for (const file of ['src/lib/password-reset.ts', 'src/app/api/auth/password-reset/route.ts', 'src/app/api/auth/password-reset/confirm/route.ts']) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(text, /email\/send|sendEmail\(|checkAllowance|recordUsage|entitlements|workspaceId/, file);
  }
  assert.match(readFileSync(join(root, 'src/lib/password-reset.ts'), 'utf8'), /sendPlatformEmail/);
});

test('password reset: el enlace de QA solo sale al log y nunca en produccion', () => {
  const lib = readFileSync(join(root, 'src/lib/password-reset.ts'), 'utf8');
  assert.match(lib, /env\.NODE_ENV !== 'production' && env\.VERCEL_ENV !== 'production'/);
  assert.match(lib, /if \(outcome\.reason === 'NOT_CONFIGURED' && canRevealResetLinkForQa\(\)\) \{\s*\n\s*\/\/[^\n]*\n\s*console\.info/);
});

test('password reset: sube sessionVersion en la misma transaccion que el passwordHash', () => {
  const lib = readFileSync(join(root, 'src/lib/password-reset.ts'), 'utf8');
  const confirm = lib.slice(lib.indexOf('export async function confirmPasswordReset('));
  const tx = confirm.slice(confirm.indexOf('prisma.$transaction('));
  assert.ok(tx.indexOf('data: { passwordHash }') > 0 && tx.indexOf('revokeAllSessions(row!.userId, tx)') > tx.indexOf('data: { passwordHash }'));
  assert.doesNotMatch(confirm, /setSessionCookie|createSessionToken/, 'el reset no inicia sesion');
});

test('cada página de /platform verifica al operador por sí misma (el layout no protege el payload)', () => {
  const pages = files(join(root, 'src/app/platform')).filter((f) => f.endsWith(`${sep}page.tsx`));
  assert.ok(pages.length >= 9);
  for (const page of pages) {
    assert.match(readFileSync(page, 'utf8'), /currentPlatformActor\(/, `${page} debe llamar currentPlatformActor y notFound()`);
  }
});

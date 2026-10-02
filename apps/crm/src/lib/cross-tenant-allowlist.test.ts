import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

/**
 * Proteccion estatica del acceso cross-tenant (P0-FOUNDATION).
 *
 * `crossTenantPrisma` es el cliente sin guardia de tenant y `withPlatformScope`
 * desactiva la guardia para un bloque. No basta con la convencion de nombre:
 * este test falla si aparecen fuera de una allowlist explicita, o si un archivo
 * permitido suma usos nuevos sin revisar (el conteo es exacto).
 *
 * Nunca se permiten en paginas, APIs tenant ni componentes (FORBIDDEN_ZONES),
 * aunque alguien los agregue a la lista.
 */

type Entry = { uses: number; why: string };

/** Llamadas `crossTenantPrisma.<modelo>` permitidas, por archivo. */
const CROSS_TENANT_PRISMA: Record<string, Entry> = {
  // --- Workers: cola de jobs y barridos periodicos -------------------------
  'src/lib/jobs/queue.ts': { uses: 5, why: 'Cola global: reencolar jobs colgados y metricas de salud de todos los tenants.' },
  'src/lib/jobs/handlers.ts': {
    uses: 5,
    why: 'Barridos del worker: acciones programadas vencidas, silencio comercial, conteo de segmentos, sync Shopify, limpieza de jobs.',
  },
  'src/lib/marketing/journeys.ts': { uses: 2, why: 'Barrido del cron: inscripciones vencidas y entradas a journeys publicados de todos los tenants.' },
  'src/lib/media/maintenance.ts': { uses: 3, why: 'Barrido: media vencida, huerfana y bloqueada en todo el storage.' },
  'src/lib/ops/maintenance.ts': { uses: 2, why: 'Barrido: vencer cotizaciones y envejecer scores sin actividad.' },
  'src/lib/whatsapp/outbound.ts': { uses: 1, why: 'processOutbox: el worker toma el outbox pendiente de todos los tenants.' },
  // --- Webhooks globales que resuelven el tenant --------------------------
  'src/lib/shopify/webhooks.ts': { uses: 1, why: 'El tenant sale del dominio de la tienda, nunca del payload: hay que buscarlo sin workspace.' },
  // --- Tests: aserciones globales de las suites smoke ---------------------
  'scripts/smoke-beta.ts': { uses: 2, why: 'Test: cuenta jobs por dedupeKey.' },
  'scripts/smoke-critico.ts': { uses: 5, why: 'Test: estado global de jobs, flags y conexiones.' },
  'scripts/smoke-fase-c-engine.ts': { uses: 1, why: 'Test: busca el job de un flow run.' },
  'scripts/smoke-fase2.ts': { uses: 2, why: 'Test: comprueba que no se crearon mensajes en ningun tenant.' },
  'scripts/smoke-fase3.ts': { uses: 2, why: 'Test: rescate de jobs colgados (cola global).' },
  'scripts/smoke-fase4.ts': { uses: 2, why: 'Test: cuenta y limpia jobs RUN_AGENT.' },
  'scripts/smoke-fase5.ts': { uses: 1, why: 'Test: acciones programadas pendientes.' },
  'scripts/smoke-foundation.ts': { uses: 23, why: 'Test: verifica la migracion y el aislamiento mirando todos los tenants.' },
  'scripts/smoke-p0b.ts': { uses: 5, why: 'Test: limpia auditoria y precios de prueba y lee la auditoria de plataforma.' },
  'scripts/smoke-p0c.ts': { uses: 2, why: 'Test: limpia los workspaces de prueba y su auditoria de plataforma.' },
  'scripts/smoke-p0d.ts': { uses: 8, why: 'Test: auditoria de plataforma y limpieza de workspaces/cuentas de prueba.' },
  'scripts/smoke-p0e.ts': { uses: 7, why: 'Test: fixtures de usuarios (miembro, SUPER_ADMIN), verificacion del negocio interno y limpieza.' },
  'scripts/smoke-p0f.ts': { uses: 3, why: 'Test: limpieza de workspaces, cuentas y auditoria de plataforma creadas por la suite.' },
  'scripts/smoke-commerce-ledger.ts': { uses: 3, why: 'Test: limpieza de los workspaces, cuentas y auditoria de plataforma que crea el smoke de ledger commerce vs SaaS.' },
  'scripts/qa-storage-cover.ts': { uses: 2, why: 'QA de portadas contra storage real: limpieza de los workspaces y cuentas de prueba que crea.' },
  'scripts/smoke-product-studio.ts': { uses: 3, why: 'Test: limpieza de los workspaces, cuentas y auditoria de plataforma que crea el smoke del Product Sales Studio.' },
};

/** Directorios de plataforma: todo lo que vive aqui es cross-tenant por diseno. */
const PLATFORM_PREFIXES = ['src/lib/platform/'];

/** `withPlatformScope(` permitido: capa de identidad/sesion, que busca por userId. */
const PLATFORM_SCOPE: Record<string, Entry> = {
  'src/lib/workspace-context.ts': { uses: 2, why: 'Carga usuario/membership/soporte por userId y escribe la auditoria de soporte.' },
  'src/lib/workspace-switch.ts': { uses: 4, why: 'Elegir workspace de entrada y abrir/elevar/cerrar SupportSession.' },
  'src/lib/membership.ts': { uses: 1, why: 'listMyWorkspaces: las memberships del propio usuario, en todos sus workspaces.' },
};

const FORBIDDEN_ZONES = ['src/app/', 'src/components/', 'src/proxy.ts'];

const EXEMPT = new Set([
  'src/lib/prisma.ts', // define crossTenantPrisma
  'src/lib/tenant-guard.ts', // define withPlatformScope
  'src/lib/tenant-guard.test.ts',
  'src/lib/cross-tenant-allowlist.test.ts',
]);

const root = process.cwd();

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const files = ['src', 'scripts', 'prisma'].flatMap((dir) => walk(join(root, dir)));

function usages(pattern: RegExp) {
  const found = new Map<string, number>();
  for (const file of files) {
    if (EXEMPT.has(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    const mentions = (text.match(pattern) ?? []).length;
    if (mentions > 0) found.set(file, mentions);
  }
  return found;
}

test('crossTenantPrisma solo aparece en la allowlist, con el conteo exacto', () => {
  const calls = usages(/\bcrossTenantPrisma\./g);
  const mentions = usages(/\bcrossTenantPrisma\b/g);

  for (const [file] of mentions) {
    const isPlatform = PLATFORM_PREFIXES.some((prefix) => file.startsWith(prefix));
    assert.ok(
      isPlatform || file in CROSS_TENANT_PRISMA,
      `${file} usa crossTenantPrisma y no esta en la allowlist (src/lib/cross-tenant-allowlist.test.ts).`,
    );
  }
  for (const [file, entry] of Object.entries(CROSS_TENANT_PRISMA)) {
    assert.equal(calls.get(file) ?? 0, entry.uses, `${file}: se esperaban ${entry.uses} usos revisados de crossTenantPrisma.`);
  }
});

test('withPlatformScope solo aparece en la capa de identidad/sesion', () => {
  const calls = usages(/\bwithPlatformScope\(/g);
  for (const [file, count] of calls) {
    const isPlatform = PLATFORM_PREFIXES.some((prefix) => file.startsWith(prefix));
    if (isPlatform) continue;
    assert.ok(file in PLATFORM_SCOPE, `${file} usa withPlatformScope y no esta en la allowlist.`);
    assert.equal(count, PLATFORM_SCOPE[file].uses, `${file}: se esperaban ${PLATFORM_SCOPE[file].uses} usos de withPlatformScope.`);
  }
  for (const file of Object.keys(PLATFORM_SCOPE)) assert.ok(calls.has(file), `${file} ya no usa withPlatformScope: quitarlo de la lista.`);
});

test('nunca en paginas, APIs tenant ni componentes', () => {
  const allowlisted = [...Object.keys(CROSS_TENANT_PRISMA), ...Object.keys(PLATFORM_SCOPE)];
  for (const file of allowlisted) {
    assert.ok(!FORBIDDEN_ZONES.some((zone) => file.startsWith(zone)), `${file} esta en una zona tenant y no puede tener acceso cross-tenant.`);
  }
  const everywhere = new Map([...usages(/\bcrossTenantPrisma\b/g), ...usages(/\bwithPlatformScope\b/g)]);
  for (const [file] of everywhere) {
    assert.ok(!FORBIDDEN_ZONES.some((zone) => file.startsWith(zone)), `${file}: acceso cross-tenant en zona tenant.`);
  }
});

test('cada entrada de la allowlist explica por que es cross-tenant', () => {
  for (const entry of [...Object.values(CROSS_TENANT_PRISMA), ...Object.values(PLATFORM_SCOPE)]) {
    assert.ok(entry.why.length > 10);
  }
});

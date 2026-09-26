import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { guardPrismaClient, tenantGuardMode } from './tenant-guard';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaBase?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect the CRM database.');
  }

  const ca = process.env.SUPABASE_CA_CERT?.trim();

  if (ca) {
    const url = new URL(connectionString);

    // Evita que los parámetros de la URL reemplacen
    // la configuración SSL explícita del adaptador.
    for (const parameter of [
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'uselibpqcompat',
    ]) {
      url.searchParams.delete(parameter);
    }

    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url.toString(),
        ssl: {
          ca,
          rejectUnauthorized: true,
        },
      }),
    });
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/**
 * Modelos con columna `workspaceId`, leidos del schema. Solo en test/smoke.
 * `User` queda fuera: desde P0-FOUNDATION es global y su `workspaceId` es legacy.
 */
function tenantModelsFromSchema() {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const models = new Set<string>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+workspaceId\s/m.test(match[2])) models.add(match[1]);
  }
  models.delete('User');
  return models;
}

/**
 * Guardia de tenant (ver lib/tenant-guard): envuelve el cliente solo cuando
 * CRM_TENANT_GUARD esta activo fuera de produccion. En produccion el cliente
 * es exactamente el de siempre.
 */
function withTenantGuard(client: PrismaClient): PrismaClient {
  const mode = tenantGuardMode();
  if (mode === 'off') return client;
  return guardPrismaClient(client, tenantModelsFromSchema(), mode);
}

const baseClient = globalForPrisma.prismaBase ?? createPrismaClient();

export const prisma = globalForPrisma.prisma ?? withTenantGuard(baseClient);

/**
 * El MISMO cliente, sin la guardia de tenant. Solo para consultas que son
 * cross-tenant a proposito y revisadas: workers y barridos (cola de jobs,
 * outbox, vencimientos), resolucion de webhooks por identificador externo y
 * vistas de Platform Admin. Usarlo marca la consulta en el codigo: si aparece
 * en una pagina o endpoint normal, es un bug de aislamiento.
 */
export const crossTenantPrisma = baseClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBase = baseClient;
}

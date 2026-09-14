import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
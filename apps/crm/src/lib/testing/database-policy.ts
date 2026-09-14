export const TEST_DATABASE_MARKER = 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1';

type DatabaseIdentity = {
  endpoint: string;
  projectRef: string | null;
};

function projectRef(url: URL) {
  const direct = url.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1];
  if (direct) return direct.toLowerCase();

  const pooled = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1];
  return pooled?.toLowerCase() ?? null;
}

export function databaseIdentity(value: string): DatabaseIdentity {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('La URL de la base de pruebas no es valida.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('La base de pruebas debe usar PostgreSQL.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username).toLowerCase();
  const port = url.port || '5432';

  return {
    endpoint: `${url.hostname.toLowerCase()}:${port}/${database.toLowerCase()}?user=${username}`,
    projectRef: projectRef(url),
  };
}

export function assertDifferentDatabase(testUrl: string, knownProductionUrls: Array<string | undefined>) {
  const test = databaseIdentity(testUrl);

  for (const candidate of knownProductionUrls) {
    if (!candidate?.trim()) continue;

    const production = databaseIdentity(candidate);
    if (test.endpoint === production.endpoint) {
      throw new Error('TEST_DATABASE_URL coincide con una conexion conocida de produccion.');
    }

    // Supabase usa hosts distintos para conexion directa y poolers. El project
    // ref, presente en el host directo o en el usuario del pooler, permite
    // reconocer que ambos caminos llegan al mismo proyecto.
    if (test.projectRef && test.projectRef === production.projectRef) {
      throw new Error('TEST_DATABASE_URL apunta al mismo proyecto Supabase que produccion.');
    }
  }
}

export function assertSameTestDatabase(primaryUrl: string, directUrl: string) {
  const primary = databaseIdentity(primaryUrl);
  const direct = databaseIdentity(directUrl);

  if (primary.endpoint === direct.endpoint) return;
  if (primary.projectRef && primary.projectRef === direct.projectRef) return;

  throw new Error('TEST_DIRECT_URL no corresponde al mismo destino aislado que TEST_DATABASE_URL.');
}

export function assertTestDatabaseMarker(marker: unknown) {
  if (marker !== TEST_DATABASE_MARKER) {
    throw new Error(
      `La base no tiene el marcador ${TEST_DATABASE_MARKER}. No se ejecutaron pruebas destructivas.`,
    );
  }
}

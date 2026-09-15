import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (process.env.LOCAL_VISUAL_TEST !== '1' ||
      !(globalThis as Record<symbol, unknown>)[Symbol.for('upzites.visual.guard')]) {
    return new Response(null, { status: 404 });
  }
  const [row] = await prisma.$queryRaw<Array<{ database: string; marker: string }>>`
    SELECT current_database() AS database, shobj_description(oid, 'pg_database') AS marker
    FROM pg_database WHERE datname = current_database()
  `;
  let blocked = false;
  try { await fetch('https://provider.invalid/blocked'); } catch { blocked = true; }
  const ok = row.database === 'crm_pruebas' && row.marker === 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1' && blocked;
  return Response.json({ database: row.database, markerValid: ok, externalNetworkBlocked: blocked }, { status: ok ? 200 : 503 });
}

import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getTeamView } from '@/lib/team/service';

export const dynamic = 'force-dynamic';

/** Equipo del workspace ACTIVO (cualquier miembro lo ve; las acciones se deciden en cada ruta). */
export async function GET() {
  const user = await requireCurrentUser();
  return NextResponse.json({ data: await getTeamView({ userId: user.id, role: user.role, workspaceId: user.workspace.id }) });
}

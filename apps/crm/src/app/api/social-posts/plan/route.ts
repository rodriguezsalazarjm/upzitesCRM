import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { SocialPostError, applyFeedPlan } from '@/lib/social/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ order: z.array(z.string().min(1)).min(1).max(120) });

/** P21: guarda el orden del Feed Planner como programación real. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede publicar.' }, { status: 403 });
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json({ data: await applyFeedPlan(user.workspace.id, parsed.data.order) });
  } catch (error) {
    if (error instanceof SocialPostError) return NextResponse.json({ message: error.message }, { status: 422 });
    throw error;
  }
}

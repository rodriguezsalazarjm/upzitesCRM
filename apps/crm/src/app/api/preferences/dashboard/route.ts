import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { WIDGET_IDS, WIDGET_SIZES } from '@/lib/dashboard/widgets/types';
import { parseBody } from '@/lib/http';
import { updateDashboardLayout } from '@/lib/preferences';
import { prisma } from '@/lib/prisma';
import { resolvePreset } from '@/lib/workspace-presets';

export const dynamic = 'force-dynamic';

const widgetId = z.enum(WIDGET_IDS);
const schema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['hide', 'show']), id: widgetId }).strict(),
  z.object({ type: z.literal('move'), id: widgetId, direction: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({ type: z.literal('resize'), id: widgetId, size: z.enum(WIDGET_SIZES as [string, ...string[]]) }).strict(),
  z.object({ type: z.literal('reset') }).strict(),
]);

/** Layout personal del dashboard (USUARIO x WORKSPACE activo). */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId: user.workspace.id } });
  const data = await updateDashboardLayout(
    { userId: user.id, workspaceId: user.workspace.id, presetWidgets: resolvePreset(profile).preset.dashboardWidgets },
    parsed.data as Parameters<typeof updateDashboardLayout>[1],
  );
  return NextResponse.json({ data: data.dashboardLayout });
}

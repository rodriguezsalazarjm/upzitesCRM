import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { isEntitlementError } from '@/lib/entitlements';
import { entitlementResponse } from '@/lib/entitlements/http';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { SocialPostError, saveSocialPost, socialPostInputSchema } from '@/lib/social/service';

export const dynamic = 'force-dynamic';

/** P19: crear un post (borrador, programado o publicar ya). Publicar habla en nombre de la marca: owner/admin. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede publicar.' }, { status: 403 });
  const parsed = await parseBody(request, socialPostInputSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json({ data: await saveSocialPost(user.workspace.id, user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (isEntitlementError(error)) return entitlementResponse(error);
    if (error instanceof SocialPostError) return NextResponse.json({ message: error.message }, { status: 422 });
    throw error;
  }
}

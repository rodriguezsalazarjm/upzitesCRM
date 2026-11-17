import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageMarketing } from '@/lib/marketing/roles';
import { LibraryError } from '@/lib/social/library-service';
import { StorageNotConfiguredError } from '@/lib/storage';

/** Biblioteca: escribir es de owner/admin (las piezas salen en nombre de la marca). */
export async function libraryHandler(run: (user: { id: string; workspaceId: string }) => Promise<unknown>, status = 200) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede gestionar la biblioteca.' }, { status: 403 });
  try {
    return NextResponse.json({ data: (await run({ id: user.id, workspaceId: user.workspace.id })) ?? null }, { status });
  } catch (error) {
    if (error instanceof LibraryError) return NextResponse.json({ message: error.message }, { status: 422 });
    if (error instanceof StorageNotConfiguredError) return NextResponse.json({ message: 'El almacenamiento de archivos no está configurado.' }, { status: 503 });
    throw error;
  }
}

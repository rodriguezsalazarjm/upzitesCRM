import { NextResponse } from 'next/server';
import { LIBRARY_TYPES } from '@/lib/social/library';
import { storeLocalLibraryUpload } from '@/lib/social/library-service';
import { libraryHandler } from '../../http';

export const dynamic = 'force-dynamic';

/** Destino de subida con disco local (dev/QA). Con Supabase responde 422: el archivo va directo al bucket. */
export async function PUT(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > LIBRARY_TYPES['video/mp4'].maxBytes) {
    return NextResponse.json({ message: 'El archivo supera 100 MB.' }, { status: 413 });
  }
  const intent = new URL(request.url).searchParams.get('intent') ?? '';
  const bytes = new Uint8Array(await request.arrayBuffer());
  return libraryHandler((user) => storeLocalLibraryUpload(user.workspaceId, intent, bytes));
}

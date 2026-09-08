import { NextResponse } from 'next/server';
import { isInternalRequest } from '@/lib/internal-auth';
import { processOutbox } from '@/lib/whatsapp/outbound';

export const dynamic = 'force-dynamic';

/**
 * Procesa solo el outbox. Se mantiene aparte de /run-jobs para poder despachar
 * mensajes sin tocar el resto de la cola cuando se esta depurando un envio.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const result = await processOutbox(50);
  return NextResponse.json({ data: result });
}

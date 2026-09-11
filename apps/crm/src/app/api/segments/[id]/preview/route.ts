import { NextResponse } from 'next/server';
import { ConsentChannel } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseDefinition, resolveSegment } from '@/lib/marketing/segments';

export const dynamic = 'force-dynamic';

/**
 * Vista previa de un segmento: cuantos son y una muestra.
 *
 * Devuelve exactamente a quien se le enviaria —ya sin los suprimidos— para que
 * el numero de la interfaz sea el mismo que el del envio. Un preview optimista
 * seria peor que no tener preview.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const segment = await prisma.segment.findFirst({
    where: { id, workspaceId: user.workspace.id },
  });

  if (!segment) return NextResponse.json({ message: 'Segmento no encontrado' }, { status: 404 });

  const definition = parseDefinition(segment.definition);
  if (!definition) {
    return NextResponse.json(
      { message: 'La definicion guardada no es valida.', code: 'INVALID_DEFINITION' },
      { status: 422 },
    );
  }

  const channelParam = new URL(request.url).searchParams.get('channel');
  const channel =
    channelParam && channelParam in ConsentChannel
      ? (channelParam as ConsentChannel)
      : ConsentChannel.EMAIL;

  const contacts = await resolveSegment({
    workspaceId: user.workspace.id,
    definition,
    channel,
  });

  // El recuento se refresca de paso: quien mira el preview es quien mas
  // necesita que el numero guardado deje de estar viejo.
  await prisma.segment.update({
    where: { id: segment.id },
    data: { estimatedCount: contacts.length, lastEvaluatedAt: new Date() },
  });

  return NextResponse.json({
    data: {
      count: contacts.length,
      channel,
      queryOnly: definition.queryOnly,
      sample: contacts.slice(0, 20).map((contact) => ({
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
      })),
    },
  });
}

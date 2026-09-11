import { NextResponse } from 'next/server';
import { processEmailEvents } from '@/lib/email/events';
import { defaultProvider } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

/**
 * Webhook del proveedor de email: entregas, aperturas, clics, rebotes y quejas.
 *
 * Tres cosas, en este orden:
 *
 *  1. Se lee el cuerpo CRUDO. Cualquier parse intermedio cambia los bytes y la
 *     firma deja de coincidir.
 *  2. Se verifica la firma. Sin firma valida no se procesa nada: un webhook
 *     abierto permitiria a cualquiera suprimir la lista de un cliente
 *     inventando rebotes.
 *  3. Se responde 200 aunque un evento individual no se pueda atribuir. Un
 *     error aqui hace que el proveedor reintente en bucle y termine cortando
 *     el webhook.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const provider = defaultProvider();

  const signature = provider.verifySignature(rawBody, request.headers);

  if (!signature.valid) {
    console.warn(`[webhooks/email] firma rechazada: ${signature.reason}`);
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  const events = provider.parseEvents(rawBody);

  if (events.length === 0) {
    // Tipo de evento que no nos interesa. Se acepta para que el proveedor no
    // lo reintente.
    return NextResponse.json({ data: { received: 0, ignored: true } });
  }

  const result = await processEmailEvents(events);

  return NextResponse.json({ data: result });
}

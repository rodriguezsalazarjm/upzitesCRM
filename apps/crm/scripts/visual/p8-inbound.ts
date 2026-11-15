/**
 * QA visual del Punto 8 (solo base de pruebas): hace llegar un mensaje entrante
 * de WhatsApp al numero indicado por el mismo pipeline del webhook (ingesta
 * idempotente + procesamiento), sin pasar por Meta ni enviar nada. La firma se
 * prueba en el smoke; aqui interesa ver el resultado en la pantalla y el Inbox.
 */
import { ingestWebhookEvent, processWebhookEvent } from '../../src/lib/whatsapp/inbound';
import { prisma } from '../../src/lib/prisma';
import { inboundTextPayload } from '../fixtures/whatsapp';

const [phoneNumberId, text = 'Hola, ¿tienen mallas para balcón?', name = 'Valentina QA P8'] = process.argv.slice(2);
if (!phoneNumberId) throw new Error('Uso: p8-inbound.ts <phoneNumberId> [texto] [nombre]');

const stamp = Date.now();
const payload = inboundTextPayload({ phoneNumberId, from: `569788${String(stamp).slice(-5)}`, messageId: `wamid.qa-p8-${stamp}`, text, profileName: name });
const raw = JSON.stringify(payload);
const ingest = await ingestWebhookEvent(raw, payload);
const processed = ingest.events > 0 ? await processWebhookEvent(ingest.eventId) : null;
console.log(JSON.stringify({ ingest, processed }));
await prisma.$disconnect();

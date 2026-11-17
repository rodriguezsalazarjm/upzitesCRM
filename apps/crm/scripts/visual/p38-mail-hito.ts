/**
 * Hito P38 (crm_pruebas, "Visual Flow A", buzón FALSO: nada sale a internet).
 * Conectar → recibir de un contacto (con adjunto) → hilo asociado a contacto,
 * empresa y oportunidad + actividad → leído/archivar en el proveedor →
 * responder en el hilo → reenviar con el adjunto → enviar una cotización desde
 * el buzón (PDF adjunto, cotización SENT, hilo en el CRM) → el cliente responde
 * y cae en el mismo hilo → aislamiento entre usuarios y negocios → token
 * renovado / revocado → cron → desconectar borra lo importado.
 * Idempotente. `--dejar` deja el buzón conectado para la QA visual.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { fakeMailProvider, fakeSentMail, injectFakeMail, setFakeMailStore } from '../../src/lib/mail/fake';
import { setMailProviderForTests } from '../../src/lib/mail/providers';
import {
  attachmentBytes, connectMailbox, disconnectMailbox, getThread, listThreads, MailError, sendMail, setThreadState, syncDueMailboxes, syncMailbox, userMailboxes,
} from '../../src/lib/mail/service';
import { createSalesQuote, saveSalesQuote } from '../../src/lib/quote-studio/service';
import { MailProviderError, type MailProviderClient } from '../../src/lib/mail/types';

const keep = process.argv.includes('--dejar');
const ok = (label: string) => console.log(`OK  ${label}`);
const store = join(process.cwd(), '.local-visual', 'fake-mailbox.json');
rmSync(store, { force: true });
setFakeMailStore(store);
setMailProviderForTests(fakeMailProvider);

const ws = async (prefix: string) => (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: prefix } }, select: { id: true } })).id;
const workspaceId = await ws('Visual Flow A');
const otherWorkspaceId = await ws('Visual Flow B');
const member = async (role: 'OWNER' | 'MEMBER' | 'ADMIN', wid = workspaceId) => (await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId: wid, role, status: 'ACTIVE' }, select: { userId: true } })).userId;
const userId = await member('OWNER');
const colleague = (await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId, status: 'ACTIVE', userId: { not: userId } }, select: { userId: true } })).userId;
const ADDRESS = 'buzon@correo-prueba.test';
const CLIENT = 'rosa.p38@cliente-p38.test';

// Limpieza de corridas anteriores.
await prisma.mailboxAccount.deleteMany({ where: { emailAddress: ADDRESS } });
const oldContact = await prisma.contact.findFirst({ where: { workspaceId, email: CLIENT }, select: { id: true } });
if (oldContact) {
  await prisma.activity.deleteMany({ where: { workspaceId, contactId: oldContact.id } });
  await prisma.salesQuote.deleteMany({ where: { workspaceId, contactId: oldContact.id } });
  await prisma.opportunity.deleteMany({ where: { workspaceId, contactId: oldContact.id } });
  await prisma.contact.deleteMany({ where: { id: oldContact.id, workspaceId } });
}
await prisma.company.deleteMany({ where: { workspaceId, name: 'Constructora P38' } });

// Contacto conocido con empresa y UNA oportunidad abierta.
const company = await prisma.company.create({ data: { workspaceId, name: 'Constructora P38' } });
const contact = await prisma.contact.create({ data: { workspaceId, firstName: 'Rosa', lastName: 'Fuentes', email: CLIENT, companyId: company.id, source: 'qa' } });
const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { workspaceId }, orderBy: { position: 'asc' } });
const opportunity = await prisma.opportunity.create({ data: { workspaceId, title: 'QA P38 Mallas edificio Rosa', contactId: contact.id, companyId: company.id, stageId: stage.id, ownerId: userId, value: 900000, probability: 50 } });

// 1. Conectar (lo mismo que hace el callback OAuth con lo que devuelve el proveedor).
const granted = await fakeMailProvider.exchangeCode('fake-consent', 'http://localhost/callback');
let account = await connectMailbox({ workspaceId, userId, provider: 'GMAIL', emailAddress: granted.emailAddress, tokens: granted });
const raw = await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } });
assert.ok(raw.accessTokenEncrypted && !raw.accessTokenEncrypted.includes('fake:'), 'el token se guarda cifrado');
ok('buzón conectado por OAuth (token cifrado, sin contraseña)');

// 2. Llega un correo del contacto, con adjunto; y otro de un desconocido.
const contract = new TextEncoder().encode('%PDF-1.4 contrato firmado');
injectFakeMail(ADDRESS, { from: CLIENT, fromName: 'Rosa Fuentes', subject: 'Medidas del edificio', text: 'Hola, te mando las medidas.\nSaludos', threadId: 'thr-rosa', internetMessageId: '<rosa-1@cliente>', attachments: [{ filename: 'medidas.pdf', mimeType: 'application/pdf', content: contract }] });
injectFakeMail(ADDRESS, { from: 'proveedor@desconocido.test', fromName: 'Proveedor X', subject: 'Factura de octubre', text: 'Adjunto la factura.' });
const first = await syncMailbox(account);
assert.equal(first.created, 2);
assert.equal((await syncMailbox(await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } }))).created, 0, 'sincronizar de nuevo no duplica');
const inbox = await listThreads(workspaceId, userId, { folder: 'inbox' });
const rosa = inbox.find((t) => t.providerThreadId === 'thr-rosa')!;
assert.equal(rosa.contactId, contact.id);
assert.equal(rosa.companyId, company.id);
assert.equal(rosa.opportunityId, opportunity.id, 'una sola oportunidad abierta: se asocia sola');
assert.equal(rosa.unread, true);
assert.equal(inbox.find((t) => t.subject === 'Factura de octubre')?.contactId, null, 'desconocido: sin contacto');
assert.ok(await prisma.activity.findFirst({ where: { workspaceId, contactId: contact.id, title: { startsWith: 'Email recibido' } } }));
assert.equal((await listThreads(workspaceId, userId, { folder: 'inbox', q: 'rosa' })).length, 1, 'buscar por persona');
assert.equal((await listThreads(workspaceId, userId, { folder: 'inbox', q: 'factura' })).length, 1, 'buscar por asunto');
ok('recibidos: hilo asociado a contacto, empresa y oportunidad + actividad; sin duplicados; búsqueda por persona y asunto');

// 3. Leído y archivar se aplican en el proveedor.
await setThreadState(workspaceId, userId, rosa.id, { read: true });
const remoteRosa = () => (fakeMailProvider.listMessages(`fake:${ADDRESS}`, new Date(0), 50)).then((l) => l.find((m) => m.threadId === 'thr-rosa')!);
assert.equal((await remoteRosa()).unread, false);
const invoice = inbox.find((t) => t.subject === 'Factura de octubre')!;
await setThreadState(workspaceId, userId, invoice.id, { archive: true });
assert.equal((await listThreads(workspaceId, userId, { folder: 'archived' })).length, 1);
assert.ok(!(await listThreads(workspaceId, userId, { folder: 'inbox' })).some((t) => t.id === invoice.id));
const download = await attachmentBytes(workspaceId, userId, (await getThread(workspaceId, userId, rosa.id)).messages[0].id, 'att-0');
assert.deepEqual(Buffer.from(download.bytes), Buffer.from(contract));
ok('leído y archivado en el proveedor; adjunto descargado byte a byte');

// 4. Responder (mismo hilo) y reenviar (con el adjunto original).
const original = (await getThread(workspaceId, userId, rosa.id)).messages[0];
const replied = await sendMail(workspaceId, userId, { mailboxId: account.id, to: [CLIENT], subject: '', text: 'Gracias Rosa, te cotizo hoy.', replyToMessageId: original.id });
assert.equal(replied.threadId, rosa.id);
const sentReply = fakeSentMail(ADDRESS).at(-1)!;
assert.equal(sentReply.threadId, 'thr-rosa');
assert.equal(sentReply.subject, 'Re: Medidas del edificio');
assert.equal(sentReply.references, '<rosa-1@cliente>', 'responde con In-Reply-To del original');
await sendMail(workspaceId, userId, { mailboxId: account.id, to: ['socio@equipo.test'], subject: '', text: 'Mira esto', forwardMessageId: original.id }, [{ filename: 'nota.txt', mimeType: 'text/plain', content: new TextEncoder().encode('extra') }]);
const forwarded = fakeSentMail(ADDRESS).at(-1)!;
assert.equal(forwarded.subject, 'Fwd: Medidas del edificio');
assert.deepEqual(forwarded.attachments.map((a) => a.filename).sort(), ['medidas.pdf', 'nota.txt']);
assert.ok(forwarded.bodyText.includes('Mensaje reenviado') && forwarded.bodyText.includes('te mando las medidas'));
assert.ok(!(await listThreads(workspaceId, userId, { folder: 'inbox' })).some((t) => t.subject.startsWith('Fwd:')), 'un reenvío nuevo va a Enviados, no a Recibidos');
assert.ok((await listThreads(workspaceId, userId, { folder: 'sent' })).some((t) => t.subject.startsWith('Fwd:')));
assert.ok(await prisma.activity.findFirst({ where: { workspaceId, contactId: contact.id, title: 'Email enviado: Re: Medidas del edificio' } }));
ok('respuesta en el mismo hilo (Re:, In-Reply-To) y reenvío con el adjunto original + uno nuevo');

// 5. Cotización desde el buzón: PDF adjunto, SENT, hilo en el CRM. Si el envío falla, NO queda enviada.
const quote = await createSalesQuote(workspaceId, userId, { contactId: contact.id, opportunityId: opportunity.id });
await saveSalesQuote(workspaceId, quote.id, {
  title: 'QA P38 Mallas', currency: 'CLP', pricesIncludeTax: false, customer: { name: 'Rosa Fuentes', company: 'Constructora P38', email: CLIENT, phone: '', taxId: '', address: '' },
  contactId: contact.id, opportunityId: opportunity.id, content: {}, lines: [{ id: 'l1', name: 'Malla', description: '', quantity: 10, unit: 'm²', unitPriceMinor: 12990, discountBp: 0, taxRateBp: null }],
}, userId);
const failing: MailProviderClient = { ...fakeMailProvider, send: async () => { throw new MailProviderError('caído', 503); } };
setMailProviderForTests(failing);
await assert.rejects(sendMail(workspaceId, userId, { mailboxId: account.id, to: [CLIENT], subject: 'Cotización', text: 'Adjunta', quoteId: quote.id }), MailError);
assert.equal((await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id } })).status, 'DRAFT', 'si el correo no sale, la cotización no queda enviada');
setMailProviderForTests(fakeMailProvider);
const quoteSent = await sendMail(workspaceId, userId, { mailboxId: account.id, to: [CLIENT], subject: `Cotización ${quote.number}`, text: 'Te adjunto la cotización.', quoteId: quote.id });
const quoteMail = fakeSentMail(ADDRESS).at(-1)!;
assert.equal(quoteMail.attachments[0].filename, `${quote.number}.pdf`);
assert.equal(Buffer.from(quoteMail.attachments[0].base64, 'base64').subarray(0, 5).toString(), '%PDF-');
const afterQuote = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id }, include: { versions: true } });
assert.equal(afterQuote.status, 'SENT');
assert.equal(afterQuote.versions[0].channel, 'mailbox');
const quoteThread = await prisma.mailThread.findUniqueOrThrow({ where: { id: quoteSent.threadId! } });
assert.equal(quoteThread.contactId, contact.id);
assert.equal(quoteThread.opportunityId, opportunity.id);
assert.ok(await prisma.mailMessage.findFirst({ where: { threadId: quoteThread.id, salesQuoteId: quote.id } }));
ok(`cotización ${quote.number} enviada desde el buzón: PDF adjunto, SENT (snapshot), hilo con contacto y oportunidad; un fallo de envío no la marca`);

// 6. El cliente responde: mismo hilo, no leído, actividad y última actividad.
injectFakeMail(ADDRESS, { from: CLIENT, fromName: 'Rosa Fuentes', subject: `Re: Cotización ${quote.number}`, text: 'Perfecto, la apruebo.', threadId: quoteThread.providerThreadId, sentAt: new Date(Date.now() + 1000) });
await syncMailbox(await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } }));
const replyThread = await prisma.mailThread.findUniqueOrThrow({ where: { id: quoteThread.id } });
assert.equal(replyThread.unread, true);
assert.equal(await prisma.mailMessage.count({ where: { threadId: quoteThread.id } }), 2);
assert.ok((await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).lastActivityAt);
ok('la respuesta del cliente cae en el mismo hilo, no leída, con actividad y última actividad');

// 7. Aislamiento: el buzón es personal y de su negocio.
assert.equal((await listThreads(workspaceId, colleague, { folder: 'inbox' })).length, 0, 'otro usuario del mismo negocio no lo ve');
await assert.rejects(getThread(workspaceId, colleague, rosa.id), MailError);
await assert.rejects(sendMail(workspaceId, colleague, { mailboxId: account.id, to: [CLIENT], text: 'x' }), MailError);
await assert.rejects(getThread(otherWorkspaceId, userId, rosa.id), MailError);
await assert.rejects(attachmentBytes(workspaceId, colleague, original.id, 'att-0'), MailError);
ok('otro usuario u otro negocio no ven, no envían y no descargan');

// 8. Token vencido → se renueva; acceso revocado → ERROR con mensaje claro.
let refreshed = 0;
setMailProviderForTests({ ...fakeMailProvider, refresh: async (t) => { refreshed += 1; return fakeMailProvider.refresh(t); } });
await prisma.mailboxAccount.update({ where: { id: account.id }, data: { accessTokenExpiresAt: new Date(Date.now() - 1000) } });
await syncMailbox(await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } }));
assert.equal(refreshed, 1);
setMailProviderForTests({ ...fakeMailProvider, listMessages: async () => { throw new MailProviderError('revocado', 401, true); } });
await assert.rejects(syncMailbox(await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } })), /Vuelve a conectar/);
assert.equal((await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } })).status, 'ERROR');
setMailProviderForTests(fakeMailProvider);
account = await connectMailbox({ workspaceId, userId, provider: 'GMAIL', emailAddress: ADDRESS, tokens: granted });
assert.equal(account.status, 'CONNECTED');
ok('token vencido se renueva solo; acceso revocado deja el buzón en ERROR; reconectar lo recupera');

// 9. Cron: sincroniza los buzones atrasados.
await prisma.mailboxAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(Date.now() - 10 * 60_000) } });
const cron = await syncDueMailboxes();
assert.ok(cron.synced >= 1);
ok(`cron: ${cron.synced} buzón(es) sincronizado(s)`);

if (!keep) {
  // 10. Desconectar borra tokens y correos importados (las actividades del CRM quedan).
  await disconnectMailbox(workspaceId, userId, account.id);
  assert.equal((await userMailboxes(workspaceId, userId)).filter((m) => m.emailAddress === ADDRESS).length, 0);
  assert.equal(await prisma.mailThread.count({ where: { mailboxId: account.id } }), 0);
  assert.ok(await prisma.activity.count({ where: { workspaceId, contactId: contact.id } }) > 0);
  ok('desconectar borra el buzón y lo importado; las actividades del CRM se conservan');
}
console.log(`\nHITO P38 OK${keep ? ' (buzón conectado para QA: buzon@correo-prueba.test)' : ''}`);
await prisma.$disconnect();

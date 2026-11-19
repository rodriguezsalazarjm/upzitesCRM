/**
 * Ensayo P32 (crm_pruebas): UPZITES como negocio real, de punta a punta.
 *  1. Un SUPER_ADMIN aprovisiona el negocio interno "UPZITES (QA P32)" con el
 *     mismo servicio que usa /platform: SCALE + COMP + SERVICES, él como OWNER.
 *  2. El formulario principal abre oportunidades (en la UI: Configuración →
 *     Conexión con mi sitio web).
 *  3. Entra un lead por el handler REAL de /api/capture/forms/[id]/submit con
 *     el mismo JSON que manda apps/web (/api/contact → forwardToCrm).
 *  4. La automatización "Tarea al llegar un lead nuevo" corre (cola de jobs).
 *  5. La oportunidad avanza por el pipeline, se cotiza (link público aceptado)
 *     y se gana.
 * Idempotente: reusa el negocio y el SUPER_ADMIN; cada corrida mete otro lead.
 * Deja el negocio para QA (login superadmin-p32@visual.test, clave de .local-visual).
 *
 * Uso (desde apps/crm): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p32-upzites-hito.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST as submitForm } from '../../src/app/api/capture/forms/[publicId]/submit/route';
import { runJobs } from '../../src/lib/jobs/runner';
import { hashPassword } from '../../src/lib/password';
import { createPlatformClient } from '../../src/lib/platform/clients';
import { prisma } from '../../src/lib/prisma';
import { respondPublicQuote } from '../../src/lib/quote-studio/public';
import { createSalesQuote, publicToken, saveSalesQuote, sendSalesQuote } from '../../src/lib/quote-studio/service';

const { password } = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')) as { password: string };
const email = 'superadmin-p32@visual.test';
const admin = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, platformRole: true } })
  ?? await prisma.user.create({ data: { name: 'Sofía SuperAdmin', email, passwordHash: hashPassword(password), role: 'ADMIN', platformRole: 'SUPER_ADMIN' }, select: { id: true, name: true, email: true, platformRole: true } });

// 1) Aprovisionamiento (idempotente por clave)
const { workspaceId: ws } = await createPlatformClient({
  actor: admin, idempotencyKey: 'qa-p32-upzites', workspaceName: 'UPZITES (QA P32)', ownerName: admin.name, ownerEmail: admin.email,
  planCode: 'SCALE', billingSource: 'COMP', isInternal: true, addActorAsOwner: true,
  initialBusiness: { businessType: 'SERVICES' }, reason: 'Ensayo P32: UPZITES como negocio real',
});
const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ws }, select: { isInternal: true, subscription: { select: { status: true, billingSource: true, plan: { select: { code: true } } } }, profile: { select: { businessType: true } } } });
assert.equal(workspace.isInternal, true);
assert.equal(workspace.subscription?.plan.code, 'SCALE');
assert.equal(workspace.subscription?.billingSource, 'COMP');
assert.equal(workspace.profile?.businessType, 'SERVICES');
assert.ok(await prisma.workspaceMembership.findFirst({ where: { workspaceId: ws, userId: admin.id, role: 'OWNER', status: 'ACTIVE' } }), 'el SUPER_ADMIN es OWNER');
const stages = await prisma.pipelineStage.findMany({ where: { workspaceId: ws }, orderBy: { position: 'asc' } });
assert.ok(stages.length >= 4, 'pipeline creado al aprovisionar');
const taskRule = await prisma.automationRule.findFirst({ where: { workspaceId: ws, trigger: 'LEAD_CREATED', isActive: true, name: { contains: 'Tarea' } } });
assert.ok(taskRule, 'la automatización de lead nuevo viene activa');

// 2) El formulario abre oportunidades (shortcut: en la QA se activa con el interruptor de Configuración)
const form = await prisma.form.findFirstOrThrow({ where: { workspaceId: ws, isActive: true }, orderBy: { createdAt: 'asc' } });
await prisma.form.updateMany({ where: { id: form.id, workspaceId: ws }, data: { createsOpportunity: true } });

// 3) Lead por el handler real, con el payload de apps/web
const stamp = Date.now().toString(36);
const leadEmail = `lead-${stamp}@cliente-p32.test`;
const submit = (body: Record<string, unknown>) => submitForm(
  new Request(`http://localhost:3101/api/capture/forms/${form.publicId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.32.${stamp.length}.1` }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ publicId: form.publicId }) },
);
const payload = {
  name: 'Martina Fuentes', email: leadEmail, phone: '+56 9 5555 0132', company: `Clínica Dental Sonrisa ${stamp}`,
  message: 'Necesito una web nueva con agenda online y WhatsApp.', service: 'Diseño web', budget: '1.000.000 - 2.500.000',
  pageUrl: 'https://www.upzites.com/contacto', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'qa-p32', consent: true,
};
const first = await submit(payload);
assert.equal(first.status, 200, await first.clone().text());
const { contactId } = (await first.json()) as { contactId: string };
const contact = await prisma.contact.findFirstOrThrow({ where: { id: contactId, workspaceId: ws } });
assert.equal(contact.status, 'LEAD');
assert.equal(contact.utmCampaign, 'qa-p32');
const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { workspaceId: ws, contactId }, include: { stage: true } });
assert.equal(opportunity.stageId, stages[0].id, 'entra en la primera etapa');
assert.match(opportunity.title, /Clínica Dental Sonrisa/);

// el mismo lead vuelve a escribir: ni otra oportunidad ni otro "lead nuevo"
assert.equal((await submit({ ...payload, message: 'Les escribo de nuevo.' })).status, 200);
assert.equal(await prisma.opportunity.count({ where: { workspaceId: ws, contactId } }), 1);

// 4) Automatización de lead nuevo
const jobs = await prisma.job.count({ where: { workspaceId: ws, dedupeKey: `trigger:LEAD_CREATED:contact:${contactId}` } });
assert.equal(jobs, 1, 'un solo LEAD_CREATED por contacto');
for (let i = 0; i < 3; i += 1) await runJobs({ limit: 50, withRecurring: false, workspaceId: ws });
const task = await prisma.activity.findFirst({ where: { workspaceId: ws, contactId, title: "Contactar lead nuevo", dueAt: { not: null } } });
assert.ok(task, 'la automatización creó la tarea de contacto');

// 5) Pipeline → cotización → venta
const stageBy = (key: string) => stages.find((s) => s.key === key)!;
await prisma.opportunity.updateMany({ where: { id: opportunity.id, workspaceId: ws }, data: { stageId: stageBy('QUALIFIED').id, probability: stageBy('QUALIFIED').probability, value: 1_800_000 } });
const quote = await createSalesQuote(ws, admin.id, { opportunityId: opportunity.id });
assert.equal(quote.contactId, contactId);
const saved = await saveSalesQuote(ws, quote.id, {
  templateId: quote.templateId, title: 'Sitio web + agenda online', currency: 'CLP', pricesIncludeTax: false,
  contactId: quote.contactId, opportunityId: quote.opportunityId, ownerId: quote.ownerId, // igual que el editor del Studio
  customer: { name: 'Martina Fuentes', company: payload.company, email: leadEmail, phone: payload.phone, taxId: '', address: '' },
  content: { intro: 'Gracias por confiar en UPZITES.', payment: '50 % al iniciar, 50 % al publicar.', conditions: '', delivery: '4 semanas.', notes: '', terms: '', contact_cta: '', footer: 'UPZITES' },
  lines: [{ id: 'l1', name: 'Sitio web corporativo', description: 'Diseño + desarrollo, 6 secciones', quantity: 1, unit: 'proyecto', unitPriceMinor: 1_500_000, discountBp: 0, taxRateBp: null }],
  globalDiscountBp: 0, charges: [], validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString(), totalMinor: 1, subtotalMinor: 1, taxMinor: 0,
} as Parameters<typeof saveSalesQuote>[2], admin.id);
await prisma.opportunity.updateMany({ where: { id: opportunity.id, workspaceId: ws }, data: { stageId: stageBy('PROPOSAL').id, probability: stageBy('PROPOSAL').probability, value: saved.totalMinor } });
await sendSalesQuote(ws, quote.id, 'link', admin.id);
assert.equal((await respondPublicQuote(publicToken(quote.id), { decision: 'accept', comment: 'Partamos.' })).ok, true);
const won = stages.find((s) => s.isWon)!;
await prisma.opportunity.updateMany({ where: { id: opportunity.id, workspaceId: ws }, data: { stageId: won.id, probability: 100, status: 'WON' } });
const final = await prisma.opportunity.findFirstOrThrow({ where: { id: opportunity.id, workspaceId: ws }, include: { stage: true, salesQuotes: { select: { status: true, totalMinor: true } } } });
assert.equal(final.stage.isWon, true);
assert.deepEqual(final.salesQuotes.map((q) => q.status), ['ACCEPTED']);

// Con el interruptor apagado, el lead entra pero no abre oportunidad
await prisma.form.updateMany({ where: { id: form.id, workspaceId: ws }, data: { createsOpportunity: false } });
const off = await submit({ ...payload, email: `off-${stamp}@cliente-p32.test`, company: '' });
const offId = ((await off.json()) as { contactId: string }).contactId;
assert.equal(await prisma.opportunity.count({ where: { workspaceId: ws, contactId: offId } }), 0);
await prisma.form.updateMany({ where: { id: form.id, workspaceId: ws }, data: { createsOpportunity: true } });

console.log(JSON.stringify({ workspace: ws, form: form.publicId, contact: contactId, opportunity: final.id, stage: final.stage.name, quote: { number: quote.number, total: saved.totalMinor }, task: task.title }, null, 2));
console.log('ENSAYO P32 LOCAL OK (lead por el handler real; el lead real necesita producción)');
await prisma.$disconnect();

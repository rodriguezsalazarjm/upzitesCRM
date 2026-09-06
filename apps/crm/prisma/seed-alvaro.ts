/**
 * Seed del PRIMER cliente real del CRM Upzites: Alvaro Quintero (mallas de seguridad).
 *
 * Crea SOLO lo indispensable para un CRM limpio "en cero":
 *   - workspace aislado
 *   - usuario OWNER (su acceso)
 *   - suscripcion activa 30 dias
 *   - etapas del pipeline (estructura obligatoria: sin etapas no se pueden crear
 *     oportunidades)
 *
 * NO carga datos: cero contactos, cero leads, cero oportunidades, cero actividades,
 * sin formularios ni integraciones precargadas. Todo eso lo crea Alvaro desde la
 * app cuando empiece a operar.
 *
 * Idempotente: se puede correr varias veces sin duplicar.
 *
 * Uso (con DATABASE_URL/DIRECT_URL apuntando a Supabase):
 *   pnpm --filter @upzites/crm exec tsx prisma/seed-alvaro.ts
 *
 * Datos configurables por env (ajusta antes de correr en produccion):
 *   ALVARO_EMAIL    (default: alvaro@mallasquintero.cl)   <-- CONFIRMAR EMAIL REAL
 *   ALVARO_COMPANY  (default: Mallas de Seguridad Quintero)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OpportunityStage,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from '../generated/prisma/client';

const EMAIL = (process.env.ALVARO_EMAIL ?? 'alvaro@mallasquintero.cl').toLowerCase().trim();
const COMPANY = process.env.ALVARO_COMPANY ?? 'Mallas de Seguridad Quintero';
const OWNER_NAME = 'Alvaro Quintero';
const SLUG = 'mallas-quintero';

// Hash pbkdf2 (mismo formato que src/lib/password.ts) de la contrasena entregada
// a Alvaro. El plaintext NO se guarda aqui. Si necesitas rotarla, regenera el hash.
const PASSWORD_HASH =
  'pbkdf2:120000:e0dcf181330a1e14e45684bab2fa87a7:07ca7a5fccc83bce87cd931aa712a2df3177d5c3083ccfff18a9823708f33607';

const MONTH_MS = 1000 * 60 * 60 * 24 * 30;

// Estructura del pipeline (NO son datos: son las columnas vacias del embudo).
const defaultStages = [
  { key: OpportunityStage.NEW, name: 'Nuevo', position: 1, probability: 20, isWon: false, isLost: false },
  { key: OpportunityStage.QUALIFIED, name: 'Medido / Cotizado', position: 2, probability: 45, isWon: false, isLost: false },
  { key: OpportunityStage.PROPOSAL, name: 'Propuesta enviada', position: 3, probability: 60, isWon: false, isLost: false },
  { key: OpportunityStage.NEGOTIATION, name: 'Negociacion', position: 4, probability: 80, isWon: false, isLost: false },
  { key: OpportunityStage.WON, name: 'Instalacion cerrada', position: 5, probability: 100, isWon: true, isLost: false },
  { key: OpportunityStage.LOST, name: 'Perdido', position: 6, probability: 0, isWon: false, isLost: true },
] as const;

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL o DATABASE_URL es requerido para el seed.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Plan mensual (upsert, mismo que lib/subscription.ts)
    const plan = await prisma.subscriptionPlan.upsert({
      where: { key: 'monthly' },
      create: {
        key: 'monthly',
        name: 'CRM Upzites Mensual',
        priceClp: 49000,
        maxUsers: 3,
        maxContacts: 1000,
        features: ['CRM', 'Captura de leads', 'Pipeline', 'Cotizador', 'Reportes'],
      },
      update: {},
    });

    const workspace = await prisma.workspace.upsert({
      where: { slug: SLUG },
      create: { name: COMPANY, slug: SLUG },
      update: { name: COMPANY },
    });

    const user = await prisma.user.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email: EMAIL } },
      create: {
        workspaceId: workspace.id,
        name: OWNER_NAME,
        email: EMAIL,
        passwordHash: PASSWORD_HASH,
        role: UserRole.OWNER,
      },
      update: { name: OWNER_NAME, passwordHash: PASSWORD_HASH, role: UserRole.OWNER },
    });

    for (const stage of defaultStages) {
      await prisma.pipelineStage.upsert({
        where: { workspaceId_key: { workspaceId: workspace.id, key: stage.key } },
        create: { workspaceId: workspace.id, ...stage },
        update: { name: stage.name, position: stage.position, probability: stage.probability },
      });
    }

    const existingSub = await prisma.workspaceSubscription.findFirst({ where: { workspaceId: workspace.id } });
    if (!existingSub) {
      await prisma.workspaceSubscription.create({
        data: {
          workspaceId: workspace.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          renewsAt: new Date(Date.now() + MONTH_MS),
        },
      });
    }

    // Conteos: confirmar que arranca EN CERO.
    const [contacts, opportunities, activities] = await Promise.all([
      prisma.contact.count({ where: { workspaceId: workspace.id } }),
      prisma.opportunity.count({ where: { workspaceId: workspace.id } }),
      prisma.activity.count({ where: { workspaceId: workspace.id } }),
    ]);

    console.log('OK — workspace:', workspace.slug, '| owner:', user.email);
    console.log('Public key de captura web (para su sitio/ADS):', workspace.publicKey);
    console.log(`Datos: contactos=${contacts} oportunidades=${opportunities} actividades=${activities} (debe ser 0/0/0)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Operaciones administrativas explicitas sobre suscripciones (P0-B).
 *
 * No hay slugs en el codigo: los workspaces y lo que se les asigna llegan por
 * argumento. Por defecto es un DRY-RUN de solo lectura (transaccion READ ONLY)
 * que funciona tambien contra una base con el schema anterior: muestra el
 * estado actual, el resultado esperado y las operaciones que se ejecutarian.
 * Solo escribe con `--apply` y `--confirm-host <host>` igual al de la base.
 *
 * Uso, desde apps/crm (usa DATABASE_URL: revisar a que base apunta):
 *   pnpm exec tsx scripts/subscription-admin.ts \
 *     --op "upzites=internal,SCALE,COMP" --op "jose=internal,SCALE,COMP" \
 *     --reason "Negocio propio / QA"
 *   ... --apply --confirm-host aws-0-us-east-2.pooler.supabase.com
 *
 * Formato de --op: <slug>=[internal,]<PLAN>,<FUENTE>[,<dias>]
 *   FUENTE: COMP (sin fin, o con <dias>) | TRIAL (<dias> obligatorio) | FREE
 */
import 'dotenv/config';
import { BillingSource, PlanCode, SubscriptionStatus } from '../generated/prisma/enums';
import { prisma } from '../src/lib/prisma';
import { isPlanCode, PLAN_CATALOG } from '../src/lib/billing/plan-catalog';
import { resolveLifecycle } from '../src/lib/billing/subscription-state';

type Op = { slug: string; internal: boolean; plan: PlanCode; source: BillingSource; days: number | null };

function parseArgs(argv: string[]) {
  const ops: Op[] = [];
  let apply = false;
  let confirmHost: string | null = null;
  let reason: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--confirm-host') confirmHost = argv[++index] ?? null;
    else if (arg === '--reason') reason = argv[++index] ?? null;
    else if (arg === '--op') {
      const raw = argv[++index] ?? '';
      const [slug, spec] = raw.split('=');
      const parts = (spec ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      const internal = parts[0] === 'internal';
      const [plan, source, days] = internal ? parts.slice(1) : parts;
      if (!slug || !isPlanCode(plan) || !(source in BillingSource)) {
        throw new Error(`--op invalido: "${raw}". Formato: <slug>=[internal,]<PLAN>,<FUENTE>[,<dias>]`);
      }
      if (source === BillingSource.MANUAL || source === BillingSource.MERCADO_PAGO) {
        throw new Error('MANUAL y MERCADO_PAGO registran pagos: usar activateManualSubscription, no este CLI.');
      }
      if (source === BillingSource.TRIAL && !days) throw new Error('TRIAL necesita <dias>.');
      ops.push({ slug, internal, plan: plan as PlanCode, source: source as BillingSource, days: days ? Number(days) : null });
    } else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (ops.length === 0) throw new Error('Indica al menos un --op.');
  return { ops, apply, confirmHost, reason };
}

type CurrentRow = {
  id: string;
  slug: string;
  name: string;
  is_internal: boolean | null;
  plan_key: string | null;
  plan_code: string | null;
  status: string | null;
  billing_source: string | null;
  trial_ends_at: Date | null;
  renews_at: Date | null;
  current_period_end: Date | null;
  mp_payment_id: string | null;
  subscriptions: number;
};

async function readCurrent(slugs: string[]) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const columns = await tx.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('workspaces', 'workspace_subscriptions', 'subscription_plans')`,
    );
    const has = (table: string, column: string) => columns.some((c) => c.table_name === table && c.column_name === column);
    const v2 = has('workspace_subscriptions', 'billing_source');
    const internal = has('workspaces', 'is_internal');
    const code = has('subscription_plans', 'code');
    const rows = await tx.$queryRawUnsafe<CurrentRow[]>(
      `SELECT w.id, w.slug, w.name,
              ${internal ? 'w.is_internal' : 'NULL::boolean'} AS is_internal,
              p.key AS plan_key, ${code ? 'p.code::text' : 'NULL::text'} AS plan_code,
              s.status::text AS status,
              ${v2 ? 's.billing_source::text' : 'NULL::text'} AS billing_source,
              s.trial_ends_at, s.renews_at,
              ${v2 ? 's.current_period_end' : 'NULL::timestamp'} AS current_period_end,
              s.mp_payment_id,
              (SELECT count(*)::int FROM workspace_subscriptions x WHERE x.workspace_id = w.id) AS subscriptions
       FROM workspaces w
       LEFT JOIN LATERAL (
         SELECT * FROM workspace_subscriptions s2 WHERE s2.workspace_id = w.id ORDER BY s2.created_at DESC LIMIT 1
       ) s ON true
       LEFT JOIN subscription_plans p ON p.id = s.plan_id
       WHERE w.slug = ANY($1)`,
      slugs,
    );
    return { rows, schema: { v2, internal, code } };
  });
}

function describeCurrent(row: CurrentRow) {
  const resolved = row.status
    ? resolveLifecycle({
        status: row.status as SubscriptionStatus,
        billingSource: (row.billing_source ?? BillingSource.FREE) as BillingSource,
        trialEndsAt: row.trial_ends_at,
        renewsAt: row.renews_at,
        currentPeriodStart: null,
        currentPeriodEnd: row.current_period_end,
        suspendedAt: null,
        mpPaymentId: row.mp_payment_id,
        currency: null,
        amountMinor: null,
        plan: { code: (row.plan_code as PlanCode | null) ?? null, key: row.plan_key ?? 'desconocido' },
      })
    : null;
  return {
    isInternal: row.is_internal ?? '(columna aun no existe)',
    plan: row.plan_code ?? `${row.plan_key} (legacy)`,
    legacyStatus: row.status,
    billingSource: row.billing_source ?? '(columna aun no existe)',
    periodEnd: (row.current_period_end ?? row.renews_at ?? row.trial_ends_at)?.toISOString() ?? null,
    stateSegunResolverV2: resolved ? `${resolved.state} (efectivo ${resolved.effectivePlan})` : 'sin suscripcion',
    filasDeSuscripcion: row.subscriptions,
  };
}

async function main() {
  const { ops, apply, confirmHost, reason } = parseArgs(process.argv.slice(2));
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://sin-configurar/').hostname;
  console.log(`Base: ${host}  modo: ${apply ? 'APPLY' : 'DRY-RUN (solo lectura)'}`);

  const { rows, schema } = await readCurrent(ops.map((op) => op.slug));
  if (!schema.v2 || !schema.internal) {
    console.log('Aviso: la base no tiene aun las migraciones de FOUNDATION/P0-B. El dry-run muestra el resultado esperado tras migrar.');
  }

  const plan = ops.map((op) => {
    const row = rows.find((candidate) => candidate.slug === op.slug);
    const periodEnd = op.days ? `+${op.days} dias` : null;
    const operations = [
      ...(op.internal ? [`setWorkspaceInternal({ isInternal: true })`] : []),
      op.source === BillingSource.COMP
        ? `assignCompSubscription({ planCode: ${op.plan}, periodEnd: ${periodEnd ?? 'null (no vence)'} })`
        : op.source === BillingSource.TRIAL
          ? `startTrial({ planCode: ${op.plan}, days: ${op.days} })`
          : `assignPlan({ planCode: FREE })`,
    ];
    return {
      slug: op.slug,
      encontrado: Boolean(row),
      workspace: row?.name ?? null,
      actual: row ? describeCurrent(row) : null,
      esperado: {
        isInternal: op.internal,
        configuredPlan: op.plan,
        billingSource: op.source,
        state: op.source === BillingSource.TRIAL ? 'TRIAL' : op.plan === PlanCode.FREE ? 'FREE' : 'ACTIVE',
        effectivePlan: op.plan,
        periodEnd: periodEnd ?? 'sin vencimiento',
        terminos: `${PLAN_CATALOG[op.plan].name} (provisional, P0-C)`,
      },
      operaciones: operations,
    };
  });
  console.log(JSON.stringify(plan, null, 2));

  const missing = plan.filter((item) => !item.encontrado);
  if (missing.length) throw new Error(`Workspaces no encontrados: ${missing.map((item) => item.slug).join(', ')}`);
  if (!apply) {
    console.log('\nDRY-RUN: no se escribio nada. Para aplicar: --apply --confirm-host <host>.');
    return;
  }
  if (confirmHost !== host) throw new Error(`--confirm-host debe ser exactamente "${host}".`);
  if (!schema.v2 || !schema.internal) throw new Error('Faltan migraciones: aplicar FOUNDATION y P0-B antes de --apply.');
  if (!reason?.trim()) throw new Error('--apply exige --reason.');

  const admin = await import('../src/lib/billing/subscription-admin');
  for (const op of ops) {
    const row = rows.find((candidate) => candidate.slug === op.slug)!;
    const actor = { via: 'cli' as const, reason };
    if (op.internal) await admin.setWorkspaceInternal({ workspaceId: row.id, isInternal: true, ...actor });
    const periodEnd = op.days ? new Date(Date.now() + op.days * 86_400_000) : null;
    const result =
      op.source === BillingSource.COMP
        ? await admin.assignCompSubscription({ workspaceId: row.id, planCode: op.plan, periodEnd, ...actor })
        : op.source === BillingSource.TRIAL
          ? await admin.startTrial({ workspaceId: row.id, planCode: op.plan, days: op.days!, ...actor })
          : await admin.assignPlan({ workspaceId: row.id, planCode: PlanCode.FREE, ...actor });
    console.log(`${op.slug}: ${result.state} ${result.configuredPlan} + ${result.billingSource}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

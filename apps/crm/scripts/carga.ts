/**
 * Pruebas de carga moderadas sobre webhook y cola (spec, Fase 10).
 *
 * No busca medir cuanto aguanta el sistema: busca comprobar que bajo
 * concurrencia sigue cumpliendo sus promesas. Un throughput alto con trabajos
 * duplicados es peor que uno bajo sin duplicar.
 *
 * Lo que se verifica:
 *   - N webhooks identicos producen UN efecto
 *   - workers concurrentes no toman el mismo trabajo dos veces
 *   - la cola avanza y nada queda atascado
 *   - el rate limiting aguanta una rafaga concurrente sin perder la cuenta
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/carga.ts [trabajos]
 */
import 'dotenv/config';
import { JobStatus, JobType } from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { activateForTests } from './fixtures/workspace';
import { claimJobs, enqueue, queueStats } from '../src/lib/jobs/queue';
import { consume } from '../src/lib/ops/rate-limit';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const TOTAL = Number(process.argv[2] ?? 300);

const { workspace } = await createCustomerWorkspace({
  companyName: `carga-${stamp}`,
  ownerName: 'Owner carga',
  email: `owner-carga-${stamp}@carga.test`,
  password: 'contrasena-de-prueba-1234',
});

await activateForTests(workspace.id);

console.log(`\n== Carga: ${TOTAL} trabajos ==\n`);

// =============================================================================
// 1. Rafaga de webhooks identicos
// =============================================================================
{
  const dedupeKey = `carga-webhook-${stamp}`;
  const inicio = Date.now();

  // Todos a la vez, no en serie: es la condicion de carrera que importa.
  await Promise.all(
    Array.from({ length: 50 }, () =>
      enqueue({
        type: JobType.PROCESS_OUTBOX,
        workspaceId: workspace.id,
        payload: {},
        dedupeKey,
      }),
    ),
  );

  const encolados = await prisma.job.count({ where: { dedupeKey } });
  check('50 webhooks identicos simultaneos dejan un solo trabajo', encolados === 1, `${encolados}`);
  console.log(`   (${Date.now() - inicio} ms)`);
}

// =============================================================================
// 2. Workers concurrentes sobre la misma cola
// =============================================================================
{
  const prefijo = `carga-job-${stamp}`;
  const inicio = Date.now();

  await Promise.all(
    Array.from({ length: TOTAL }, (_, index) =>
      enqueue({
        type: JobType.PROCESS_OUTBOX,
        workspaceId: workspace.id,
        payload: { index },
        dedupeKey: `${prefijo}-${index}`,
      }),
    ),
  );

  const encolados = await prisma.job.count({ where: { dedupeKey: { startsWith: prefijo } } });
  check(`Se encolan los ${TOTAL} trabajos`, encolados === TOTAL, `${encolados}`);
  console.log(`   encolado en ${Date.now() - inicio} ms`);

  // Ocho "workers" tomando lotes a la vez, como haria el cron con varias
  // instancias sirviendo el mismo endpoint.
  const tomaInicio = Date.now();
  const lotes = await Promise.all(Array.from({ length: 8 }, () => claimJobs(50)));

  const tomados = lotes.flat();
  const ids = tomados.map((job) => job.id);
  const unicos = new Set(ids);

  check(
    'Ocho workers concurrentes no toman el mismo trabajo dos veces',
    ids.length === unicos.size,
    `${ids.length} tomas, ${unicos.size} unicos`,
  );

  console.log(`   ${ids.length} trabajos tomados en ${Date.now() - tomaInicio} ms`);

  // Todo lo tomado quedo en PROCESSING: nadie se lo llevo sin marcarlo.
  const enProceso = await prisma.job.count({
    where: { id: { in: ids }, status: JobStatus.PROCESSING },
  });
  check('Todo lo tomado quedo marcado como en proceso', enProceso === ids.length);

  // Se cuenta solo lo de esta tanda: la cola tiene ademas el trabajo del
  // bloque anterior, y sumarlo aqui compararia peras con manzanas.
  const deLaTanda = await prisma.job.groupBy({
    by: ['status'],
    where: { dedupeKey: { startsWith: prefijo } },
    _count: { _all: true },
  });

  const porEstado = Object.fromEntries(deLaTanda.map((row) => [row.status, row._count._all]));
  const pendientes = porEstado[JobStatus.PENDING] ?? 0;
  const procesando = porEstado[JobStatus.PROCESSING] ?? 0;

  check(
    'Nada se perdio: lo tomado mas lo pendiente son los mismos trabajos',
    pendientes + procesando === TOTAL,
    `${pendientes} pendientes + ${procesando} en proceso de ${TOTAL}`,
  );

  const stats = await queueStats();
  console.log(
    `   cola: ${stats.pending} pendientes, ${stats.processing} en proceso, ${stats.dead} muertos`,
  );

  check('Ningun trabajo quedo muerto', stats.dead === 0);
}

// =============================================================================
// 3. Rate limiting bajo concurrencia
// =============================================================================
{
  const identificador = `carga-${stamp}`;
  const limite = 10;

  // 30 peticiones a la vez sobre un limite de 10.
  const respuestas = await Promise.all(
    Array.from({ length: 30 }, () => consume('login', identificador)),
  );

  const permitidas = respuestas.filter((r) => r.allowed).length;

  check(
    'Bajo concurrencia el limitador no pierde la cuenta',
    permitidas === limite,
    `${permitidas} permitidas de 30, limite ${limite}`,
  );

  const window = await prisma.rateLimitWindow.findFirst({
    where: { bucket: `login:${identificador}` },
  });
  check('Y queda una sola ventana con el total', window?.count === 30, `${window?.count}`);
}

// =============================================================================
// 4. Ritmo de escritura de mensajes entrantes
// =============================================================================
{
  const contacto = await prisma.contact.create({
    data: { workspaceId: workspace.id, firstName: 'Carga', lastName: 'Uno', phone: '+56911110000' },
  });

  const canal = await prisma.whatsAppChannel.create({
    data: {
      workspaceId: workspace.id,
      wabaId: `waba-carga-${stamp}`,
      phoneNumberId: `phone-carga-${stamp}`,
      displayPhoneNumber: '+56911110000',
      status: 'CONNECTED',
    },
  });

  const conversacion = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      channelId: canal.id,
      contactId: contacto.id,
      mode: 'AI_ACTIVE',
      status: 'OPEN',
    },
  });

  const inicio = Date.now();
  const cantidad = 200;

  // El mismo `externalMessageId` repetido: es lo que manda Meta cuando
  // reintenta, y no puede producir doscientos mensajes.
  await Promise.all(
    Array.from({ length: cantidad }, (_, index) =>
      prisma.message.upsert({
        where: { externalMessageId: `carga-${stamp}-${index % 20}` },
        create: {
          workspaceId: workspace.id,
          conversationId: conversacion.id,
          externalMessageId: `carga-${stamp}-${index % 20}`,
          direction: 'INBOUND',
          senderType: 'CONTACT',
          text: `mensaje ${index}`,
          status: 'DELIVERED',
        },
        update: {},
      }).catch(() => null),
    ),
  );

  const guardados = await prisma.message.count({ where: { conversationId: conversacion.id } });
  const duracion = Date.now() - inicio;

  check(
    '200 entregas de 20 mensajes distintos guardan 20 mensajes',
    guardados === 20,
    `${guardados} guardados`,
  );
  console.log(`   ${cantidad} escrituras en ${duracion} ms (${Math.round(cantidad / (duracion / 1000))}/s)`);
}

// --- Limpieza ---------------------------------------------------------------
await prisma.job.deleteMany({ where: { dedupeKey: { startsWith: `carga-` } } });
await prisma.rateLimitWindow.deleteMany({ where: { bucket: { contains: `carga-${stamp}` } } });
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'carga-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);

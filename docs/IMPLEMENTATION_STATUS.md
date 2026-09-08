# IMPLEMENTATION_STATUS — CRM Upzites beta SaaS

Seguimiento de la ejecucion de `ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md` (v1.0, 6-sep-2026).
Este archivo se actualiza al cierre de cada fase. No reemplaza a `contexto.md`.

- **Fase actual:** 2 — WhatsApp e Inbox humano
- **Estado:** COMPLETADA con fixtures. Esperando credenciales de Meta y aprobacion para la Fase 3.
- **Ultima actualizacion:** 2026-09-07

---

## 1. Checklist de fases

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Proteccion y linea base | **Completada** (2026-09-07) |
| 1 | Dominio comercial y consentimiento | **Completada** (2026-09-07) |
| 2 | WhatsApp e Inbox humano | **Completada** (2026-09-07), probada con fixtures |
| 3 | Cola, scheduler y automatizaciones reales | No iniciada — requiere aprobacion |
| 4 | Agentes IA y herramientas | No iniciada |
| 5 | Infoproductos, Mercado Pago y entrega | No iniciada |
| 6 | Shopify | No iniciada |
| 7 | Cotizador y aprobaciones | No iniciada |
| 8 | Recuperacion, email y campanas | No iniciada |
| 9 | Onboarding SaaS, planes y consumo | No iniciada |
| 10 | Hardening y lanzamiento beta | No iniciada |

### Fase 0 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Inspeccion del monorepo, `apps/crm`, Prisma, migraciones, env, Vercel | Hecho | Seccion 2 |
| `git status` y clasificacion de cambios sin commit | Hecho | Seccion 3 |
| Lectura de instrucciones locales (`AGENTS.md`, `CLAUDE.md`, README) | Hecho | No existen `AGENTS.md` ni `CLAUDE.md`; solo `README.md` y `contexto.md` |
| Build de produccion registrado | Hecho | Seccion 4 |
| Lint y typecheck base registrados | Hecho | Seccion 4 |
| Inventario de rutas, tablas, migraciones y variables | Hecho | Seccion 2 |
| Config faltante de Mercado Pago documentada | Hecho | B3 |
| `docs/IMPLEMENTATION_STATUS.md` | Hecho | Este archivo |
| Plan de migraciones | Hecho | Seccion 7 |
| Commit de respaldo del estado actual | Hecho | `8d3c790`, `187d3f1`, `303b368` en `origin/master` |
| Base de datos operativa | Hecho | Proyecto Supabase nuevo, 6 migraciones aplicadas (seccion 5) |
| Pruebas funcionales | Hecho | 24/25 (seccion 6) |

**Criterio de salida:** el estado actual puede restaurarse y desplegarse de forma reproducible.
**Cumplido:** el codigo esta en `origin/master`, la base tiene el esquema completo y las pruebas
de aceptacion pasan contra una instancia real. Queda **un defecto conocido** (D13) y el
despliegue en Vercel pendiente de actualizar variables (T3).

---

### Fase 1 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Enums de ciclo de vida, temperatura, intencion, orden, pago, cotizacion y consentimiento | Hecho | 12 enums nuevos (seccion 2) |
| Entidades de consentimiento, scoring, scheduled actions, uso y supresion | Hecho | 6 tablas nuevas |
| Migracion compatible con contactos actuales | Hecho | `20260907120000_fase1_dominio_comercial` con backfill |
| Servicios de transicion de estado | Hecho | `src/lib/domain/` |
| Audit log de cambios | Hecho | `recordAudit` en toda transicion y cambio de consentimiento |
| Pruebas | Hecho | 41/41 (seccion 6) |

**Criterio de salida:** el CRM representa contacto, intencion, oportunidad, orden y pago sin
mezclar conceptos. **Cumplido:** el ciclo de vida, la temperatura y la intencion de compra son
ahora dimensiones independientes; el consentimiento es por canal y la supresion sobrevive al
contacto.

---

### Fase 2 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| `WhatsAppChannel`, `Conversation`, `Message`, `WebhookEvent`, `OutboxEvent` | Hecho | 5 tablas nuevas |
| Verificacion GET y recepcion POST del webhook | Hecho | `/api/webhooks/whatsapp` |
| Validacion de firma | Hecho | `x-hub-signature-256` sobre el cuerpo crudo |
| Resolucion de workspace por `phoneNumberId` | Hecho | Nunca se lee el workspace del payload |
| Normalizacion de texto y estados | Hecho | `lib/whatsapp/normalize.ts`, 10 tipos de mensaje |
| Envio de mensajes | Hecho | Patron outbox con reintentos y dead letter |
| Estados sent/delivered/read/failed | Hecho | Solo avanzan, nunca retroceden |
| Inbox con toma, asignacion y devolucion | Hecho | `/inbox` y `/inbox/[id]` |
| Creacion de contacto desde mensaje | Hecho | Con consentimiento de WhatsApp automatico |
| Pruebas | Hecho | 46/46 con fixtures (seccion 6) |

**Criterio de salida:** un cliente piloto puede conectar un numero, recibir y responder desde el
CRM sin IA. **Cumplido a nivel de codigo y probado con fixtures.** Falta la validacion contra la
API real de Meta, que requiere credenciales (T9).

**Templates fuera de alcance por ahora:** enviar plantillas aprobadas requiere darlas de alta en
Meta. La bandeja ya detecta y avisa cuando la ventana de 24 horas se cerro; el envio de plantilla
llega junto con las credenciales.

---

## 2. Inventario de la linea base

### Stack verificado

Next.js 16.0 (App Router, React 19), Prisma 7.8 + `@prisma/adapter-pg`, PostgreSQL/Supabase,
Tailwind 4, Radix, Zod 3, TanStack Query, Zustand. Node v25.9.0, pnpm 11.3.0.
Despliegue: proyecto Vercel `upzites-crm` (`prj_o89p2u9wo254GTHfkvv8MQmzxedH`).

### Base de datos

Proyecto Supabase **`mtdtccnchxpwnjllpsog`**, region `us-east-2`
(pooler `aws-0-us-east-2.pooler.supabase.com`). Creado el 2026-09-07 para reemplazar al
anterior, que fue eliminado. Region elegida para quedar junto a las funciones de Vercel,
que corren en `iad1` al no declararse `regions` en `vercel.json`.

- `DATABASE_URL`: transaction pooler, puerto 6543 (runtime).
- `DIRECT_URL`: session pooler, puerto 5432 (Prisma CLI: migraciones y seed).
- 30 tablas (29 modelos + `_prisma_migrations`) tras la Fase 2. Sin datos.

### Modelos Prisma (29)

Base (18): `Workspace`, `User`, `PasswordResetToken`, `Company`, `Contact`, `PipelineStage`,
`Opportunity`, `Activity`, `LeadSource`, `Form`, `FormSubmission`, `WebEvent`, `Integration`,
`AutomationRule`, `AiInsight`, `SubscriptionPlan`, `WorkspaceSubscription`, `AuditLog`.

Fase 1 (6): `ContactChannelConsent`, `SuppressionEntry`, `LeadScoreRule`, `LeadScoreSnapshot`,
`ScheduledAction`, `UsageRecord`.

Fase 2 (5): `WhatsAppChannel`, `Conversation`, `Message`, `WebhookEvent`, `OutboxEvent`.

`Contact` sumo cinco columnas: `lifecycleStatus`, `temperature`, `buyingIntent`, `leadScore` y
`scoreUpdatedAt`.

### Enums (34)

Base (13): `UserRole`, `ContactStatus`, `OpportunityStage`, `OpportunityStatus`, `ActivityType`,
`WebEventType`, `IntegrationProvider`, `IntegrationStatus`, `AutomationTrigger`,
`AutomationAction`, `AiInsightType`, `InsightStatus`, `SubscriptionStatus`.

Fase 1 (12): `LifecycleStatus`, `LeadTemperature`, `BuyingIntent`, `ConversationMode`,
`OrderStatus`, `PaymentStatus`, `QuoteStatus`, `ConsentStatus`, `ConsentChannel`,
`SuppressionReason`, `ScheduledActionType`, `ScheduledActionStatus`.

Fase 2 (9): `WhatsAppChannelStatus`, `ConversationStatus`, `MessageDirection`,
`MessageSenderType`, `MessageType`, `MessageStatus`, `WebhookEventStatus`, `OutboxType`,
`OutboxStatus`.

`ConversationMode` (creado en la Fase 1) ya se usa. `OrderStatus`, `PaymentStatus` y `QuoteStatus`
siguen sin entidad: llegan con las Fases 5, 6 y 7.

### Migraciones (8, todas aplicadas)

```
20260614171000_init_crm
20260614182000_auth_workspaces
20260614190000_web_capture
20260614200000_integrations_ai_billing_ops
20260630220000_contact_owner
20260630220100_billing_mercadopago
20260907120000_fase1_dominio_comercial
20260907140000_fase2_mensajeria_whatsapp
```

La migracion de la Fase 1 es aditiva: agrega columnas con default, crea tablas nuevas y hace
backfill de `lifecycle_status` desde el `status` existente (LEAD->LEAD, ACTIVE->QUALIFIED,
CUSTOMER->CUSTOMER, INACTIVE->LOST). **No elimina `status`**, que la UI y las rutas siguen
leyendo. De paso corrige un drift preexistente: `users.password_hash` tenia un DEFAULT que el
esquema no declaraba.

**Reversion:** `DROP TABLE` de las 6 tablas nuevas, `ALTER TABLE contacts DROP COLUMN` de las 5
columnas y `DROP TYPE` de los 12 enums. No hay perdida de datos preexistentes porque nada se
reescribio salvo el backfill, que es derivable de `status`.

`prisma migrate status` responde `Database schema is up to date!`.

### Rutas API (26 handlers)

Auth: `login`, `logout`, `me`, `register`, `password-reset`.
CRM: `contacts` (+`[id]`, `import`, `export`), `opportunities` (+`[id]`), `activities` (+`[id]`),
`pipeline-stages` (+`[id]`), `integrations`.
Captura publica: `capture/events`, `capture/forms/[publicId]`, `capture/forms/[publicId]/submit`,
`capture/snippet`.
Comercial/ops: `billing/checkout`, `billing/webhook`, `ai/insights/generate`, `automations/run`,
`system/health`.

### Paginas (13)

`dashboard`, `contactos` (+ficha +nuevo), `oportunidades` (+nueva), `actividades`, `fuentes`,
`integraciones`, `automatizaciones`, `insights`, `billing`, `ops`, `configuracion`,
mas `login` y `register`.

### Variables de entorno actuales

Obligatorias en produccion (validadas en `src/lib/env.ts` via `instrumentation.ts`):
`DATABASE_URL`, `DIRECT_URL`, `CRM_SESSION_SECRET` (min. 16 chars), `NEXT_PUBLIC_CRM_BASE_URL`.
Opcionales (solo advertencia, el checkout responde 503 sin ellas):
`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`.

### Capa de dominio (Fase 1)

`apps/crm/src/lib/domain/` concentra las reglas comerciales. Ninguna ruta ni agente debe escribir
estados comerciales con un `prisma.update` directo.

| Archivo | Responsabilidad |
|---|---|
| `lifecycle.ts` | Transiciones validas del ciclo de vida, espejo del `status` legado y `applyApprovedPayment` |
| `consent.ts` | Consentimiento por canal, supresion normalizada y `canContact` |
| `scheduled-actions.ts` | Programar y cancelar acciones diferidas, quiet hours |
| `scoring.ts` | Score determinista y explicable, temperatura y snapshots |
| `audit.ts` | `recordAudit`, compartido por todos los servicios |

Reglas implementadas segun la spec:

- A `CUSTOMER` solo se llega con `PAYMENT_APPROVED` o `HUMAN_CONFIRMED`. Cualquier otra razon
  lanza `LifecycleTransitionError`.
- `canContact` exige consentimiento explicito: la ausencia de registro **no** habilita el envio.
- La supresion manda sobre el consentimiento y sobrevive al contacto, por lo que una
  reimportacion CSV no puede resucitar a alguien que pidio no ser contactado.
- Revocar consentimiento cancela en la misma transaccion las acciones pendientes del contacto.
- Un pago aprobado convierte a cliente, cancela la recuperacion y marca las oportunidades ganadas.

Cableado inicial: el submit de formulario registra consentimiento por canal cuando el formulario
trae el campo `consent`, y el registro de workspace siembra las reglas de scoring por defecto.

### Capa de mensajeria (Fase 2)

`apps/crm/src/lib/whatsapp/` aisla todo lo que conoce el formato de Meta. Cambiar de proveedor
deberia tocar solo `normalize.ts` y `client.ts`.

| Archivo | Responsabilidad |
|---|---|
| `signature.ts` | Firma `x-hub-signature-256` y handshake GET del webhook |
| `normalize.ts` | Aplana el payload de Meta a eventos propios; tolera formas desconocidas |
| `inbound.ts` | Ingesta idempotente, resolucion de workspace y aplicacion de eventos |
| `client.ts` | Llamadas a Graph API; distingue errores reintentables de definitivos |
| `outbound.ts` | Outbox, reintentos con espera creciente y dead letter |
| `../crypto.ts` | AES-256-GCM para los tokens de integracion |

Decisiones de diseno:

- **El webhook no procesa nada pesado.** Valida firma, persiste el evento y responde 200. El
  procesamiento corre despues y puede reintentarse; la Fase 3 lo mueve a una cola durable.
- **La firma se valida sobre el cuerpo crudo.** Parsear antes de verificar cambia los bytes y la
  firma nunca coincidiria.
- **El workspace se resuelve por `phoneNumberId`**, que es unico global. Un payload jamas elige su
  propio tenant. Un numero desconocido no crea nada.
- **Doble idempotencia**: por evento (`WebhookEvent.dedupeKey`) y por mensaje
  (`Message.externalMessageId`, unico). Diez reentregas producen un solo mensaje.
- **Una conversacion por (canal, contacto).** Un mensaje sobre una conversacion cerrada la reabre
  en vez de fragmentar el historial.
- **El outbox persiste antes de llamar a Meta.** Un envio fallido deja el mensaje visible como
  FAILED con boton de reintento, en vez de desaparecer.
- **Los estados solo avanzan.** Un `sent` que llega tarde no pisa un `read` ya registrado.
- **Escribir primero otorga consentimiento de WhatsApp**, pero solo para responder: el marketing
  requiere un opt-in explicito aparte.

### Scripts de apoyo creados

- `scripts/set-crm-db.mjs`: escribe `apps/crm/.env.production.local` a partir del connection
  string de Supabase, URL-encodea la password y **verifica la conexion antes de escribir**.
- `scripts/smoke-fase0.mjs`: pruebas de aceptacion de la Fase 0 (por HTTP).
- `apps/crm/scripts/smoke-fase1.ts`: pruebas de aceptacion de la Fase 1 (capa de dominio).
  Correr desde `apps/crm` con `pnpm exec tsx scripts/smoke-fase1.ts`.
- `apps/crm/scripts/smoke-fase2.ts` y `scripts/fixtures/whatsapp.ts`: pruebas de la Fase 2 con
  payloads que imitan los de Meta. No requieren credenciales.

---

## 3. Trabajo que estaba sin commit (riesgo #1 — resuelto)

Al inspeccionar, `git status` reportaba **99 entradas** sin proteger sobre `master` (HEAD `418a1c1`).
Todo quedo commiteado el 2026-09-06 en tres commits sobre `origin/master`:

| Commit | Contenido |
|---|---|
| `8d3c790` | `.gitignore`: excluir `Soluciones/` (1.2 GB de video) |
| `187d3f1` | Respaldo de 181 archivos de web y CRM, sin cambios funcionales |
| `303b368` | Primera version de este informe |

Detalle de lo respaldado: en `apps/crm`, 22 archivos modificados y 15 sin trackear (registro,
webhook de Mercado Pago, `lib/env.ts`, `lib/http.ts`, `lib/mercado-pago.ts`, `lib/subscription.ts`,
`instrumentation.ts`, `vercel.json`, `seed-alvaro.ts` y 2 migraciones). En `apps/web`, la seccion
`/blog`, las landings de `/soluciones`, `robots.ts`, `sitemap.ts`, `lib/resend.ts` y assets.

`Soluciones/` (1.2 GB) sigue intacta en disco, excluida de git y de Vercel.
**Pendiente: respaldarla fuera de git — hoy existe en una sola copia local (T2).**

### Secretos

Ningun `.env` real quedo trackeado; `git ls-files` solo devuelve archivos `.env.example`.

---

## 4. Verificacion de la linea base

| Comando | Resultado |
|---|---|
| `pnpm --filter @upzites/crm build` | **OK** (exit 0). 40 rutas generadas |
| `pnpm --filter @upzites/crm lint` | **OK** (0 errores, 2 warnings) |
| `pnpm --filter @upzites/crm exec tsc --noEmit` | **OK** (0 errores) |
| `pnpm --filter @upzites/web build` | **OK** (exit 0) |

### Errores preexistentes registrados

1. `postcss.config.js:1` — warning `import/no-anonymous-default-export`.
2. `tailwind.config.js:2` — warning `import/no-anonymous-default-export`.

No hay errores de compilacion ni de tipos preexistentes.

---

## 5. Bloqueadores

### B1 — Base de datos de produccion inalcanzable — RESUELTO (2026-09-07)

El proyecto `qvuneqedhhnkfgvdzmjj` estaba **eliminado** (su DNS no resolvia). Un segundo intento
con `ulagrcyczvmoslngmigl` llegaba al servidor pero rechazaba las credenciales. Se decidio crear
un proyecto nuevo y limpio: `mtdtccnchxpwnjllpsog`, con las 6 migraciones aplicadas.

### B2 — Sin base de datos local — RESUELTO con salvedad

No hay Docker en la maquina, asi que `apps/crm/.env` apunta al **mismo** proyecto Supabase que
produccion. Sirve para desarrollar hoy, pero no es sostenible: ver D14.

### B3 — Mercado Pago sin configurar (abierto)

`MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` siguen vacios. El arranque no se
bloquea (por diseno), pero `POST /api/billing/checkout` responde 503. Las pruebas del webhook
se ejecutaron con fixtures de firma invalida, que es lo que la Fase 0 exige; el flujo de pago
completo se valida en la Fase 5.

### B4 — Trabajo sin commit — RESUELTO (2026-09-06)

Ver seccion 3.

### B5 — TLS interceptado en la maquina de desarrollo (abierto, solo local)

El runtime usa `@prisma/adapter-pg` (node-postgres), que valida la cadena de certificados con
Node. En esta maquina hay un root CA autofirmado interceptando TLS (antivirus o proxy), y la
conexion falla con `P1011 TlsConnectionError: self-signed certificate in certificate chain`.
La CLI de Prisma no se ve afectada porque usa su propio motor.

**Workaround local:** `apps/crm/.env` usa `sslmode=no-verify` en `DATABASE_URL`.
**En Vercel debe ir `sslmode=require`.** No copiar el `.env` local a produccion.

---

## 6. Pruebas de aceptacion de la Fase 0

`node scripts/smoke-fase0.mjs`, ejecutado el 2026-09-07 contra el CRM en `localhost:3001`
conectado al Supabase real. Crea dos workspaces desechables y los elimina al terminar
(verificado: la base queda en cero).

**Resultado: 24/25.**

| Area | Pruebas | Estado |
|---|---|---|
| Auth | Registro de 2 workspaces, login de ambos, password incorrecta devuelve 401 | 5/5 |
| CRUD contacto | Crear, listar, actualizar, verificar persistencia del cambio | 4/4 |
| Aislamiento tenant | B no ve el contacto de A; B no altera el dato de A; sin sesion no se lista | 3/3 |
| Aislamiento tenant (codigo HTTP) | ID ajeno devuelve 404/403 | **0/1 — D13** |
| Captura web | Formulario por defecto creado, render publico, submit, contacto creado en el workspace correcto, UTM conservada, submission registrada | 6/6 |
| Eventos web | Ingesta, persistencia en el workspace correcto, `publicKey` invalida rechazada | 3/3 |
| Webhook Mercado Pago | Sin firma rechazado (401), firma invalida rechazada (401) | 2/2 |
| Health | Reporta base OK | 1/1 |

La unica falla es de codigo de estado, no de seguridad: se comprobo por consulta directa a la
base que el contacto de A conserva su valor tras el intento de escritura desde B.

### Fase 1

`pnpm exec tsx scripts/smoke-fase1.ts` desde `apps/crm`, ejecutado el 2026-09-07 contra la base
real. Ejercita los servicios de dominio directamente. Crea dos workspaces `fase1-*` y los
elimina al terminar.

**Resultado: 41/41.**

| Area | Pruebas | Estado |
|---|---|---|
| Reglas de scoring por defecto al crear workspace | 1 | 1/1 |
| Transiciones de ciclo de vida (validas, invalidas, razon obligatoria, auditoria) | 9 | 9/9 |
| Aislamiento tenant en los servicios de dominio | 2 | 2/2 |
| Consentimiento por canal, revocacion y no-resurreccion por reimportacion | 7 | 7/7 |
| Supresion por identidad normalizada (rebote duro) | 3 | 3/3 |
| Pago aprobado: cliente, cancelacion de recovery, oportunidad ganada, recompra | 6 | 6/6 |
| Cancelacion por `cancelKey` | 1 | 1/1 |
| Quiet hours (funcion pura) | 6 | 6/6 |
| Scoring determinista y explicable | 6 | 6/6 |

La suite de la Fase 0 se reejecuto tras la Fase 1: **25/26**, sin regresiones (la unica falla
sigue siendo D13). Incluye una prueba nueva del cableado: el formulario web con consentimiento
marcado lo registra en los canales EMAIL y WHATSAPP.

### Fase 2

`pnpm exec tsx scripts/smoke-fase2.ts` desde `apps/crm`, ejecutado el 2026-09-07. Usa fixtures
que imitan los payloads de Meta, por lo que **no requiere credenciales**. Crea dos workspaces
`fase2-*` con numeros distintos y los elimina al terminar.

**Resultado: 46/46.**

| Area | Pruebas | Estado |
|---|---|---|
| Cifrado de tokens (ida y vuelta, IV aleatorio, no filtra el texto plano) | 4 | 4/4 |
| Firma del webhook (valida, invalida, ausente, cuerpo alterado) | 4 | 4/4 |
| Normalizacion (mensaje, evento no soportado, payload desconocido) | 3 | 3/3 |
| Mensaje entrante (contacto, nombre, fuente, consentimiento, conversacion, no leidos, ventana 24h) | 10 | 10/10 |
| Idempotencia: 10 reentregas del mismo evento | 3 | 3/3 |
| Aislamiento entre workspaces y numero desconocido | 4 | 4/4 |
| Envio humano, outbox, fallo visible y reproceso sin duplicar | 7 | 7/7 |
| Takeover: la IA no responde con humano activo | 3 | 3/3 |
| Un workspace no escribe en la conversacion de otro | 1 | 1/1 |
| Estados por webhook (avance, no retroceso, canal ajeno ignorado) | 4 | 4/4 |
| Reapertura de conversacion cerrada sin duplicar | 3 | 3/3 |

**Verificacion en la interfaz:** con un workspace de demostracion se comprobo en el navegador que
la bandeja lista las conversaciones con su preview y contador de no leidos, que el detalle muestra
el hilo, y que "Tomar conversacion" cambia el modo a humano y el boton pasa a "Devolver a IA". El
workspace de demostracion se elimino despues (base verificada en cero).

Tras la Fase 2 se reejecutaron las suites anteriores: **Fase 1 en 41/41** y **Fase 0 en 25/26**,
sin regresiones.

---

## 7. Deuda tecnica

| # | Item | Impacto |
|---|---|---|
| D1 | Sin rate limiting en `/api/auth/login`, la captura publica (CORS `*`) ni el webhook de WhatsApp | Seccion 15 de la spec lo exige antes de beta publica |
| D2 | Sin runner de tests formal (Vitest/Jest): las suites son scripts ejecutables por fase | Conviene consolidarlas antes de la Fase 10 |
| D3 | ~~Sin pruebas de aislamiento entre workspaces~~ — cubierto por `smoke-fase0.mjs` | — |
| D4 | ~~Sin cifrado de tokens de integracion~~ — resuelto en la Fase 2 con `lib/crypto.ts` (AES-256-GCM). Queda migrar `Integration.config`, que sigue en JSON plano | Fase 6 |
| D5 | `ScheduledAction` existe pero **nadie la ejecuta**. El outbox si se procesa, pero solo en linea o por `/api/internal/process-outbox`: falta la cola durable y el cron | Fase 3 |
| D6 | La regla de automatizacion esta hardcodeada; `trigger`/`action`/`conditions` no se ejecutan | Fase 3 |
| D7 | "Insights IA" es scoring heuristico determinista, sin LLM | Fase 4 |
| D8 | 7 de 9 proveedores de `Integration` son solo estado en BD, sin OAuth ni sync | Fases 2, 6 y 8 |
| D9 | ~~`ContactStatus` mezcla ciclo de vida con intencion~~ — resuelto en la Fase 1. Queda la deuda menor de **retirar `status`** una vez que la UI consuma `lifecycleStatus` | Fase 9 o antes |
| D10 | Fallback demo (`admin@upzites.cl` / `demo1234`) activo cuando `NODE_ENV !== production` | Acotado, pero revisar antes de pilotos |
| D11 | Formulario de perfil del workspace en `/configuracion` es `readOnly` con boton deshabilitado | Fase 9 |
| D12 | Sin `AGENTS.md` ni `CLAUDE.md` en el repositorio | Conviene crearlos |
| **D13** | **Un ID de otro workspace en `PATCH`/`DELETE /api/contacts/[id]` devuelve 500 en vez de 404.** El dato esta protegido (`where: { id, workspaceId }`), pero el `P2025` de Prisma no se captura | Exigido por la matriz de pruebas (seccion 18 de la spec). Revisar tambien `opportunities`, `activities` y `pipeline-stages`, que siguen el mismo patron |
| **D14** | Desarrollo local apunta al **mismo** proyecto Supabase que produccion | Un error en dev afecta datos reales. Crear un segundo proyecto Supabase para dev |
| **D15** | El procesamiento del webhook corre **en linea** dentro del request. Funciona, pero un pico de mensajes lo hace lento | Fase 3 lo mueve a la cola durable |
| **D16** | Sin descarga de media (imagenes, audio, documentos): se guarda el payload con el id de Meta, no el archivo | La spec pide almacenamiento privado con URLs firmadas. Fase 3 o 10 |
| **D17** | Sin envio de plantillas aprobadas: fuera de la ventana de 24h la bandeja avisa pero no permite responder | Requiere dar de alta las plantillas en Meta (T9) |
| **D18** | Sin debounce de mensajes entrantes (la spec pide agrupar 2-4 s) ni lock por conversacion | Recien importan cuando responde la IA: Fase 4 |

---

## 8. Plan de migraciones

1. Una migracion por fase, nunca una migracion monolitica.
2. Toda columna nueva sobre tablas con datos entra como nullable o con default.
3. Renombres en dos pasos (agregar + backfill + dejar de leer, luego eliminar en una migracion
   posterior), nunca destructivos en el mismo despliegue.
4. Antes de cada `migrate deploy` se verifica `migrate status` y se toma respaldo Supabase.
5. Cada migracion documenta aqui su procedimiento de reversion.

Punto de partida: las 6 migraciones existentes estan aplicadas y verificadas sobre
`mtdtccnchxpwnjllpsog`.

---

## 9. Tareas manuales del propietario

| # | Tarea | Por que |
|---|---|---|
| T1 | ~~Aprobar el commit de respaldo~~ — hecho el 2026-09-06 | — |
| T2 | Respaldar `Soluciones/` (1.2 GB) fuera de git: disco externo o nube | Ya no se versiona; hoy existe en una sola copia local |
| T3 | Actualizar las variables del proyecto Vercel `upzites-crm` con las URLs del proyecto Supabase nuevo (con `sslmode=require`, no `no-verify`) y `CRM_SESSION_SECRET` | El CRM desplegado apunta a una base eliminada: esta caido |
| T4 | Entregar `MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` (TEST primero) | Desbloquea B3 y la Fase 5 |
| T5 | **Rotar la password de Postgres de `mtdtccnchxpwnjllpsog`** | Se compartio por chat durante el setup |
| T6 | Crear un segundo proyecto Supabase para desarrollo | D14 |
| T7 | Confirmar el email real de Alvaro Quintero antes de correr `seed-alvaro.ts` | El seed trae un default provisional |
| T8 | Aprobar el inicio de la Fase 3 (cola y scheduler) | La spec exige aprobacion explicita por fase |
| T9 | **Credenciales de Meta**: `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` y un numero de prueba | Valida la Fase 2 contra la API real; hoy solo esta probada con fixtures |
| T10 | Generar `INTEGRATION_ENCRYPTION_KEY` e `INTERNAL_WORKER_SECRET` para Vercel | Sin la primera no se pueden guardar tokens; sin la segunda el worker del outbox responde 401 |

---

## 10. Variables de entorno pendientes por fase

| Variable | Fase | Obligatoria para |
|---|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | 0 / 5 | Cobro de suscripcion y de productos |
| `INTEGRATION_ENCRYPTION_KEY` | 2 | Cifrado de tokens de integracion. **Ya implementada**; generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `INTERNAL_WORKER_SECRET` | 2 | Protege `/api/internal/*`. **Ya implementada** |
| `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | 2 | WhatsApp Cloud API. **Ya implementadas**: sin ellas el webhook rechaza todo |
| `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_SYSTEM_ACCESS_TOKEN` | 2 | Opcionales: version de Graph API (por defecto v21.0) y token de sistema para pilotos |
| `META_APP_ID`, `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | 9 | Embedded Signup; hasta entonces el numero se conecta a mano |
| `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_DEFAULT_MODEL` | 4 | Agentes IA |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES` | 6 | Shopify |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET` | 8 | Email marketing |

`src/lib/env.ts` debera distinguir variables obligatorias para arrancar de variables que solo
habilitan una integracion: una integracion sin configurar aparece inactiva, no tumba el CRM.

---

## 11. Diferencias entre el repositorio y la especificacion

Resumen del informe de la Fase 0. Detalle por fase en la spec.

**Modelo de datos:** tras la Fase 2 existen 29 tablas. Mensajeria: hecha (5/5). Faltan agentes
IA (0/4), comercio (0/7) y cotizaciones (0/4). De marketing y seguimiento ya estan consentimiento,
scoring, supresion y scheduled actions; faltan segmentos, journeys y campanas. Uso y costos: hecho.

**Enums:** completos. Los 8 que exige la spec estan creados, mas 4 de apoyo. `ContactStatus`
convive con `LifecycleStatus` mediante backfill y espejo automatico; se retira cuando la UI
consuma el campo nuevo.

**Infraestructura:** el patron outbox, los reintentos y el dead-letter estan implementados en la
Fase 2. Faltan la cola durable, el scheduler, los locks por conversacion y el debounce (Fases 3 y 4).

**Seguridad:** el cifrado de tokens quedo resuelto en la Fase 2. Faltan rate limiting y CSRF.
Los webhooks de Mercado Pago y de Meta ya cumplen el estandar de la spec (firma validada e
idempotencia); sirven de plantilla para el de Shopify.

**Se preserva y reutiliza:** auth y roles, multi-tenancy por `workspaceId`, captura web,
pipeline, actividades, atribucion UTM, billing de suscripcion y audit log.

**Correccion a la spec:** la Fase 5 pide "extender el webhook existente sin romper billing de
suscripcion". El webhook actual asume que *todo* pago aprobado es una suscripcion y activa el
workspace. Extenderlo exige discriminar por `metadata`/`external_reference` antes de tocarlo, o
el primer infoproducto vendido regalara suscripciones.

---

## 12. Decisiones registradas

| Fecha | Decision |
|---|---|
| 2026-09-06 | Se adopta `ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md` v1.0 como fuente de verdad de la beta |
| 2026-09-06 | El CRM existente se evoluciona, no se reescribe. Auth, multi-tenancy, captura web, pipeline y Mercado Pago se preservan |
| 2026-09-06 | `Soluciones/` (1.2 GB de video) se excluye del control de versiones y se respalda aparte |
| 2026-09-07 | Base de datos nueva en region `us-east-2`, junto a las funciones de Vercel (`iad1`), en vez de Sudamerica: pesa mas la latencia funciones-base que navegador-base |
| 2026-09-07 | D13 no se corrige en la Fase 0: es un cambio de codigo fuera del alcance de la fase. Queda registrado con prueba que lo cubre |
| 2026-09-07 | `ContactStatus` NO se elimina en la Fase 1. Se agrega `lifecycleStatus` con backfill y `transitionLifecycle` mantiene ambos sincronizados. Retirar la columna vieja es una migracion posterior, cuando nada la lea |
| 2026-09-07 | El consentimiento requiere registro explicito: la ausencia de dato no habilita el envio. Es mas restrictivo que el minimo legal, y evita que una importacion masiva se interprete como permiso |
| 2026-09-07 | Las reglas de scoring que dependen de canales aun no implementados (apertura de email, checkout real, medidas de cotizacion) NO se inventan: se documentan y llegan con su fase |
| 2026-09-07 | Una conversacion por (canal, contacto). Un mensaje sobre una conversacion cerrada la reabre en vez de crear otra: fragmentar el historial hace inutil el contexto para el agente de la Fase 4 |
| 2026-09-07 | El webhook procesa en linea de forma provisional. La separacion ingesta/procesamiento ya esta hecha, asi que la Fase 3 solo cambia quien llama a `processWebhookEvent` |
| 2026-09-07 | Escribir primero otorga consentimiento de WhatsApp solo para responder. El marketing sigue requiriendo opt-in explicito: responderle a quien te escribio no es lo mismo que agregarlo a una campana |
| 2026-09-07 | **La beta es multivertical, no un producto para mallas de seguridad.** Iron Mallas / Alvaro Quintero es UN piloto entre varios (infoproductos, ecommerce, servicios). Ninguna regla de negocio, etiqueta, etapa de pipeline, campo de intake ni prompt puede quedar hardcodeado a ese rubro: todo lo especifico de un vertical vive como configuracion por workspace. Los ejemplos de la spec referidos a mallas se leen como datos de piloto, no como requisitos del producto |

---

## 13. Bitacora

### 2026-09-06 — Fase 0, inspeccion y respaldo

- Inspeccion completa del monorepo y de `apps/crm`.
- Verificacion de linea base: build CRM y web OK, lint 0 errores, `tsc` 0 errores.
- Detectado B1: el proyecto Supabase de produccion no existia.
- Detectado B2: sin base de datos local (Docker no disponible).
- Detectado `Soluciones/` con 1.2 GB sin trackear ni ignorar.
- Respaldo aprobado y ejecutado: 3 commits en `origin/master`.

### 2026-09-07 — Fase 0, base de datos y pruebas

- Descartados dos proyectos Supabase (uno eliminado, otro con credenciales invalidas).
  Creado `mtdtccnchxpwnjllpsog` en `us-east-2`.
- `prisma migrate deploy`: 6 migraciones aplicadas sobre base vacia. 19 tablas verificadas.
- Detectado B5: TLS interceptado en la maquina; `sslmode=no-verify` como workaround **solo local**.
- Creados `scripts/set-crm-db.mjs` y `scripts/smoke-fase0.mjs`.
- Pruebas de aceptacion: **24/25**. Unica falla D13 (codigo de estado, sin fuga de datos).
- Base verificada en cero tras la limpieza de los workspaces de prueba.
- **Fase 0 cerrada.**

### 2026-09-07 — Fase 1, dominio comercial y consentimiento

- 12 enums y 6 tablas nuevas; `Contact` sumo 5 columnas.
- Migracion `20260907120000_fase1_dominio_comercial` generada con `prisma migrate diff`
  (sin shadow database) y ampliada a mano con el backfill. Aplicada sobre la base real.
- Capa de dominio en `src/lib/domain/`: ciclo de vida, consentimiento, acciones programadas,
  scoring y auditoria.
- Cableado inicial: consentimiento desde el formulario web y reglas de scoring al registrar.
- Pruebas: **41/41** en Fase 1 y **25/26** en Fase 0 (sin regresiones).
- Build, lint y `tsc` limpios. Base verificada sin datos residuales.
- Incidente durante las pruebas: el servidor de desarrollo mantenia el cliente Prisma anterior
  a `prisma generate` y fallaba con `tx.leadScoreRule undefined`. **Tras cambiar el esquema hay
  que reiniciar el dev server**, el HMR no basta.
- **Fase 1 cerrada.**

### 2026-09-07 — Fase 2, WhatsApp e Inbox humano

- Restriccion de producto registrada: **la beta es multivertical**, mallas de seguridad es un
  piloto. Nada de un rubro se hardcodea.
- 5 tablas y 9 enums nuevos; migracion `20260907140000_fase2_mensajeria_whatsapp`, aditiva.
- Cifrado de secretos de integracion con AES-256-GCM (`lib/crypto.ts`).
- Webhook de Meta con verificacion GET, firma sobre el cuerpo crudo e ingesta idempotente.
- Bandeja `/inbox` con lista, hilo, compositor, estados de entrega, reintento de fallidos,
  toma y devolucion a la IA.
- Rutas: webhook, conversaciones (listar, ver, enviar, tomar, devolver, asignar, reintentar),
  conexion y desconexion de canal, y worker interno del outbox.
- `lib/env.ts` ahora distingue lo que bloquea el arranque de lo que solo desactiva una integracion.
- Pruebas: **46/46** con fixtures. Fase 1 en 41/41 y Fase 0 en 25/26, sin regresiones.
- Verificado en el navegador: bandeja, hilo y takeover funcionando.
- Incidente: el build fallo con un error de tipos en `.next/dev/types/routes.d.ts`. No era del
  codigo: el servidor dev reescribia ese archivo mientras el build lo leia. **Hay que parar el
  dev server antes de `pnpm build`.**
- **Fase 2 cerrada a nivel de codigo. Falta validarla contra la API real de Meta (T9).**
  No se inicia la Fase 3 sin aprobacion del propietario.

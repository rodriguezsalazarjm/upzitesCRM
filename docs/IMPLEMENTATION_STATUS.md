# IMPLEMENTATION_STATUS — CRM Upzites beta SaaS

Seguimiento de la ejecucion de `ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md` (v1.0, 6-sep-2026).
Este archivo se actualiza al cierre de cada fase. No reemplaza a `contexto.md`.

- **Fase actual:** 8 — Recuperacion, email y campanas
- **Estado:** COMPLETADA y verificada end-to-end en local, incluida la baja publica.
  Esperando aprobacion para la Fase 9.
- **Ultima actualizacion:** 2026-09-11

---

## 1. Checklist de fases

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Proteccion y linea base | **Completada** (2026-09-07) |
| 1 | Dominio comercial y consentimiento | **Completada** (2026-09-07) |
| 2 | WhatsApp e Inbox humano | **Completada** (2026-09-07), probada con fixtures |
| 3 | Cola, scheduler y automatizaciones reales | **Completada** (2026-09-07) |
| 4 | Agentes IA y herramientas | **Completada** (2026-09-07), probada con proveedor guionado |
| 5 | Infoproductos, Mercado Pago y entrega | **Completada** (2026-09-08) |
| 6 | Shopify | **Completada** (2026-09-08), probada con fixtures |
| 7 | Cotizador y aprobaciones | **Completada** (2026-09-08) |
| 8 | Recuperacion, email y campanas | **Completada** (2026-09-11) |
| 9 | Onboarding SaaS, planes y consumo | No iniciada — requiere aprobacion |
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

### Fase 3 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Cola y consumidores | Hecho | `lib/jobs/` con reclamo `FOR UPDATE SKIP LOCKED` |
| Motor `trigger -> conditions -> actions` | Hecho | `lib/automation/` |
| `ScheduledAction` y cancelacion por clave | Hecho | Scheduler que promueve las vencidas |
| Reintentos y dead-letter | Hecho | Espera creciente 30 s / 2 / 5 / 15 min / 1 h, luego DEAD |
| Triggers minimos | Hecho | 13 disparadores; 9 activos, 4 reservados para fases posteriores |
| Acciones minimas | Hecho | 12 acciones tipadas y validadas con Zod |
| UI de reglas predefinidas | Hecho | Catalogo de 7 reglas activables desde `/automatizaciones` |

**Criterio de salida:** los seguimientos funcionan sin intervencion manual y son auditables.
**Cumplido:** el cron encola, el worker procesa, las reglas se ejecutan una sola vez por evento y
cada ejecucion queda en `AutomationExecution` y en el audit log.

---

### Fase 4 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| OpenAI Responses API desde backend | Hecho | `lib/agents/provider.ts`, token central en el servidor |
| Agente de ventas inicial | Hecho | Preset generico, sin rubro asumido |
| Versionado de agentes | Hecho | `AgentVersion` con DRAFT / PUBLISHED / ARCHIVED |
| Registro de runs, tokens y costos | Hecho | `AgentRun` + `UsageRecord` por workspace |
| Tool calling tipado | Hecho | 9 herramientas con Zod y lista blanca por version |
| Lock por conversacion y debounce | Hecho | Lock atomico en SQL; ventana de 3 s |
| Resumen de contexto | Hecho | Resumen + ultimos 12 mensajes, no la conversacion entera |
| Handoff humano | Hecho | `assign_to_human` y escalamiento automatico |
| Simulador y publicacion | Hecho | `POST /api/agents/[id]/test` sin enviar nada al cliente |
| Guardrails | Hecho | En prompt y en codigo (seccion 2) |

**Criterio de salida:** el agente atiende un lead de principio a fin en ambiente de prueba, con
toda accion critica validada por backend. **Cumplido contra el proveedor guionado.** La validacion
contra el modelo real queda pendiente de creditos (T12).

**Router:** la spec pide un agente ROUTER ademas del comercial. El enum `AgentKind` ya lo
contempla, pero con un solo agente publicado no hay nada que rutear: se implementa cuando existan
los agentes de cotizacion y postventa (Fases 5 y 7).

---

### Fase 5 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Catalogo interno digital | Hecho | `Product` + `ProductVariant` + `DigitalAsset` |
| Orden y lineas | Hecho | `CustomerOrder` + `OrderLine` con snapshot de precio |
| Checkout MP vinculado a orden/contacto/workspace | Hecho | `lib/commerce/checkout.ts` |
| Webhook extendido sin romper billing de suscripcion | Hecho | Bifurcacion por `metadata.kind` |
| Distincion estricta suscripcion vs producto | Hecho | Probado: comprar NO activa la suscripcion |
| Entrega digital segura e idempotente | Hecho | Token hasheado + unique `(orderId, assetId)` |
| Recovery de checkout | Hecho | 1 h / 24 h / 72 h con `cancelKey` comun |
| Postventa | Hecho | Cliente, oportunidad ganada y actividad al confirmarse el pago |
| Reenvio manual de acceso | Hecho | `POST /api/orders/[id]/resend`, solo owner/admin |

**Criterio de salida:** un lead puede comprar y recibir el producto sin intervencion humana.
**Cumplido a nivel de codigo y probado end-to-end sobre la base real**, incluyendo idempotencia,
adulteracion de monto y pago pendiente. Falta la vuelta completa contra la API de Mercado Pago,
que requiere credenciales (T4).

**Producto piloto:** la spec nombra "5 Minutos con Dios" y BIENESTAR. No se hardcodearon: son
**datos de un workspace**, no del producto. El catalogo se carga por API o por la pagina de
Productos.

---

### Fase 6 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| App/configuracion Shopify | Hecho | Variables en `.env.example`, estado en `/api/integrations/shopify/status` |
| OAuth, token offline cifrado y desconexion | Hecho | `lib/shopify/oauth.ts` + AES-256-GCM |
| Sincronizacion de productos y variantes | Hecho | Idempotente por `(connectionId, externalId)` |
| Consulta viva de precio e inventario | Hecho | `fetchLiveVariant` antes de cada checkout |
| Draft Order y enlace de pago | Hecho | Admin GraphQL API |
| Webhooks verificados | Hecho | HMAC base64 sobre el cuerpo crudo |
| Sincronizacion de orden, pago y fulfillment | Hecho | 5 topics |
| Herramientas de agente Shopify | Hecho | `create_checkout` y `check_inventory` bifurcan por proveedor |
| Vista de integracion y salud | Hecho | Sin exponer el token |

**Criterio de salida:** una tienda piloto completa una venta iniciada por WhatsApp y recibe la
orden en Shopify. **Cumplido a nivel de codigo y probado con fixtures.** Falta la vuelta contra
una tienda real, que requiere crear la app en Shopify Partners (T16).

---

### Fase 8 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Lead scoring y temperatura explicable | Hecho | Se activaron las dos reglas de email que la Fase 1 dejo pendientes |
| Segmentos beta | Hecho | Los 8 de la spec, como **datos** con el mismo lenguaje que uno propio |
| Journeys de lead silencioso, checkout, cotizacion y postventa | Hecho | Los 4, con los tiempos de la spec (9.4 a 9.7) |
| Email provider, dominio, templates, campaigns y webhooks | Hecho | Interfaz `EmailProvider` + adaptadores Resend y guionado |
| Unsubscribe y suppression global por canal/workspace | Hecho | `/baja/[token]` publico, verificado en el navegador |
| Frequency caps y quiet hours | Hecho | `lib/marketing/policy.ts`, en la zona horaria del workspace |
| Metricas de journey/campana | Hecho | Contadores materializados + tasa de recuperacion |
| Personalizacion con IA dentro de limites del template | Hecho | `aiSlots`: el modelo rellena huecos, no escribe el email |

**Criterio de salida:** el CRM recupera leads y ejecuta campanas autorizadas sin envios indebidos.
**Cumplido.** Las seis pruebas que la spec exige para la fase estan cubiertas y la baja publica se
verifico end-to-end en el navegador: abrir el enlace no da de baja a nadie, confirmar si, y tras
confirmar el contacto desaparece de todos los segmentos enviables.

**La idea que ordena la fase:** hay **una sola puerta de envio**. Journeys, campanas y avisos
operativos pasan todos por `evaluateSend`, que decide en este orden: primero lo que bloquea para
siempre (consentimiento, supresion) y despues lo que solo posterga (silencio, frecuencia). Que el
orden sea ese importa: el motivo que queda guardado es el verdadero, y no "quiet hours" cuando en
realidad la persona pidio no ser contactada.

**Lo que se decidio no frenar:** un mensaje operativo de una compra no consume topes de marketing
ni espera al amanecer. Lo unico que lo detiene es la supresion, porque un rebote duro significa que
el buzon no existe. Confundir marketing con servicio en la direccion contraria —frenar la
confirmacion de una compra por un tope de campana— seria peor que el problema que el tope resuelve.

**Sobre el piloto:** ni los 8 segmentos ni los 4 journeys de fabrica nombran un rubro, y hay dos
pruebas que fallan si uno se cuela. Los textos son genericos y editables: son un punto de partida,
no el mensaje definitivo de nadie.

---

### Fase 7 — detalle

| Entregable | Estado | Evidencia |
|---|---|---|
| Pricing rule sets versionados | Hecho | `PricingRuleSet` con DRAFT/PUBLISHED/ARCHIVED |
| Schemas de intake por servicio | Hecho | `intakeSchema` en JSON validado con Zod |
| Quote, lines, versiones, approval request | Hecho | 4 tablas nuevas |
| Motor matematico determinista | Hecho | `lib/quotes/engine.ts`, funcion pura |
| PDF con branding del workspace | Hecho | Sin dependencias, verificado en navegador |
| Estimacion preliminar y cotizacion final | Hecho | El agente calcula; solo lo aprobado se envia |
| Cola de revision | Hecho | `/cotizaciones` con desglose y diferencia entre versiones |
| Envio por WhatsApp y seguimiento | Hecho | `POST /api/quotes/[id]/send` |
| Configuracion piloto | Hecho | Como **datos**, no codigo: el servicio se define por API |

**Criterio de salida:** un negocio de servicios puede recibir medidas, revisar y enviar la
cotizacion desde el CRM. **Cumplido y verificado end-to-end en local**, incluida la generacion y
apertura del PDF en el navegador.

**Sobre el piloto:** la spec nombra Iron Mallas y sus campos (medidas, pilares, tipo de malla).
Nada de eso esta en el codigo. El servicio de prueba usa terminos genericos —superficie, unidades,
dificultad de acceso— y hay una prueba que falla si un rubro se cuela. Configurar el piloto es
cargar un `PricingRuleSet` por API.

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
- 61 tablas (60 modelos + `_prisma_migrations`) tras la Fase 8. Sin datos: cada suite limpia
  lo suyo y se verifico que no quedan filas residuales.

### Modelos Prisma (60)

Base (18): `Workspace`, `User`, `PasswordResetToken`, `Company`, `Contact`, `PipelineStage`,
`Opportunity`, `Activity`, `LeadSource`, `Form`, `FormSubmission`, `WebEvent`, `Integration`,
`AutomationRule`, `AiInsight`, `SubscriptionPlan`, `WorkspaceSubscription`, `AuditLog`.

Fase 1 (6): `ContactChannelConsent`, `SuppressionEntry`, `LeadScoreRule`, `LeadScoreSnapshot`,
`ScheduledAction`, `UsageRecord`.

Fase 2 (5): `WhatsAppChannel`, `Conversation`, `Message`, `WebhookEvent`, `OutboxEvent`.

Fase 8 (12): `MessagingPolicy`, `Segment`, `Journey`, `JourneyStep`, `JourneyEnrollment`,
`EmailDomain`, `EmailTemplate`, `Campaign`, `CampaignRecipient`, `EmailMessage`, `EmailEvent`,
`ContactSendLog`.

Fase 7 (4): `PricingRuleSet`, `Quote`, `QuoteLine`, `ApprovalRequest`.

Fase 5 (9): `CommerceConnection`, `Product`, `ProductVariant`, `DigitalAsset`, `CustomerOrder`,
`OrderLine`, `Payment`, `FulfillmentOrder`, `DigitalDelivery`.

Fase 4 (4): `AgentDefinition`, `AgentVersion`, `AgentRun`, `ConversationAgentState`.

Fase 3 (2): `Job`, `AutomationExecution`. `AutomationRule` sumo `actions`, `dedupeMinutes` y
`runCount`; su `action` singular quedo opcional y solo se lee para reglas antiguas.

`Contact` sumo cinco columnas: `lifecycleStatus`, `temperature`, `buyingIntent`, `leadScore` y
`scoreUpdatedAt`.

### Enums (65)

Base (13): `UserRole`, `ContactStatus`, `OpportunityStage`, `OpportunityStatus`, `ActivityType`,
`WebEventType`, `IntegrationProvider`, `IntegrationStatus`, `AutomationTrigger`,
`AutomationAction`, `AiInsightType`, `InsightStatus`, `SubscriptionStatus`.

Fase 8 (13): `SegmentSource`, `JourneyStatus`, `JourneyTrigger`, `JourneyStepAction`,
`JourneyEnrollmentStatus`, `EmailProviderKind`, `EmailDomainStatus`, `EmailTemplateStatus`,
`CampaignStatus`, `CampaignRecipientStatus`, `EmailMessageStatus`, `EmailEventType`,
`SendCategory`. `AutomationTrigger` sumo `EMAIL_OPENED`, `EMAIL_CLICKED` y `EMAIL_BOUNCED`;
`JobType` sumo seis trabajos.

Fase 1 (12): `LifecycleStatus`, `LeadTemperature`, `BuyingIntent`, `ConversationMode`,
`OrderStatus`, `PaymentStatus`, `QuoteStatus`, `ConsentStatus`, `ConsentChannel`,
`SuppressionReason`, `ScheduledActionType`, `ScheduledActionStatus`.

Fase 2 (9): `WhatsAppChannelStatus`, `ConversationStatus`, `MessageDirection`,
`MessageSenderType`, `MessageType`, `MessageStatus`, `WebhookEventStatus`, `OutboxType`,
`OutboxStatus`.

Fase 7 (4): `PricingRuleSetStatus`, `QuoteLineKind`, `ApprovalType`, `ApprovalStatus`.
`QuoteStatus`, creado vacio en la Fase 1, por fin tiene entidad.

Fase 6: sin enums nuevos. Se agrego `SHOPIFY` a `IntegrationProvider` y
`PROCESS_SHOPIFY_EVENT` / `SYNC_SHOPIFY_CATALOG` a `JobType`.

Fase 5 (8): `CommerceProvider`, `ProductType`, `ProductStatus`, `DigitalAssetKind`,
`PaymentProvider`, `FulfillmentType`, `FulfillmentStatus`, `DeliveryStatus`. `OrderStatus` y
`PaymentStatus`, creados vacios en la Fase 1, por fin tienen entidades que los usan.

Fase 4 (3): `AgentKind`, `AgentVersionStatus`, `AgentRunStatus`.

Fase 3 (3): `JobType`, `JobStatus`, `AutomationExecutionStatus`. Ademas `AutomationTrigger` paso
de 4 a 13 valores y `AutomationAction` de 4 a 13.

`ConversationMode` (creado en la Fase 1) ya se usa. `OrderStatus`, `PaymentStatus` y `QuoteStatus`
siguen sin entidad: llegan con las Fases 5, 6 y 7.

### Migraciones (17, todas aplicadas)

```
20260614171000_init_crm
20260614182000_auth_workspaces
20260614190000_web_capture
20260614200000_integrations_ai_billing_ops
20260630220000_contact_owner
20260630220100_billing_mercadopago
20260907120000_fase1_dominio_comercial
20260907140000_fase2_mensajeria_whatsapp
20260907160000_fase3_cola_automatizaciones
20260907180000_fase4_agentes_ia
20260907190000_fase4_job_run_agent
20260908120000_fase5_comercio_entrega
20260908140000_fase6_shopify_sync
20260908150000_fase6_integration_shopify
20260908160000_fase6_job_shopify
20260908180000_fase7_cotizador
20260910120000_fase8_recuperacion_email
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

### Cola y automatizaciones (Fase 3)

| Archivo | Responsabilidad |
|---|---|
| `lib/jobs/queue.ts` | Encolar, reclamar, completar, reintentar y rescatar trabajos colgados |
| `lib/jobs/handlers.ts` | Un handler por tipo de trabajo, mas los recurrentes del cron |
| `lib/jobs/runner.ts` | Consumidor: procesa un lote con presupuesto de tiempo |
| `lib/automation/schema.ts` | Condiciones y acciones validadas con Zod |
| `lib/automation/conditions.ts` | Evaluador puro con AND/OR y un nivel de anidamiento |
| `lib/automation/engine.ts` | Evalua reglas y ejecuta acciones |
| `lib/automation/emit.ts` | Unico punto para anunciar un hecho del dominio |
| `lib/automation/presets.ts` | Catalogo de 7 reglas predefinidas, genericas por diseno |

**Decision de arquitectura: cola en tabla propia, no pgmq.** La spec pone a Supabase Queues/pgmq
como primera preferencia. Se verifico que `pgmq` 1.5.1 y `pg_cron` 1.6.4 estan **disponibles pero
no instaladas** en el proyecto, y se opto por una tabla `Job` con `FOR UPDATE SKIP LOCKED`:

1. El repositorio ya usa ese patron dos veces (`WebhookEvent`, `OutboxEvent`); una tercera cola
   con la misma forma no agrega conceptos nuevos.
2. Ops debe mostrar profundidad y antiguedad de cola **por workspace**. Con pgmq los mensajes
   viven en otro schema como JSONB opaco y cruzarlos con datos del tenant exige SQL crudo.
3. Prisma la tipa, las pruebas la consultan y la migracion viaja con el resto del esquema, sin
   depender de una extension habilitada a mano.

La garantia que importa —un solo consumidor por trabajo— la da `SKIP LOCKED`, no la extension.
Si el volumen lo justifica mas adelante, migrar a pgmq solo toca `lib/jobs/queue.ts`.

**Como corre el cron:** `vercel.json` declara un cron cada minuto sobre `/api/internal/run-jobs`.
En el plan Hobby de Vercel los crons corren una vez al dia, asi que para la beta hay que estar en
Pro **o** activar `pg_cron` + `pg_net` en Supabase y golpear el mismo endpoint. El endpoint acepta
el secreto por `x-internal-secret` o por `Authorization: Bearer`, que es lo que manda Vercel Cron.

Otras decisiones:

- **Una ejecucion por evento** la garantiza el unique `(ruleId, dedupeKey)` de
  `AutomationExecution`, no un chequeo en memoria: sobrevive a reintentos y a workers paralelos.
- **`SET_LIFECYCLE` no permite CUSTOMER.** Una automatizacion no puede convertir a cliente:
  eso exige pago aprobado o confirmacion humana (regla de la Fase 1).
- **Las acciones pasan por los servicios de dominio**, no escriben estados a mano, asi que no
  pueden saltarse validaciones ni auditoria.
- **Un evento que referencia datos de otro workspace se descarta entero** y se audita.
- Las reglas del catalogo son **genericas**: ninguna asume un rubro, porque la beta es
  multivertical.

### Agentes IA (Fase 4)

| Archivo | Responsabilidad |
|---|---|
| `lib/agents/provider.ts` | Interfaz de modelo, cliente OpenAI y proveedor guionado para pruebas |
| `lib/agents/tools.ts` | 9 herramientas tipadas con Zod, auditadas, con workspace del servidor |
| `lib/agents/guardrails.ts` | Reglas en el prompt + deteccion de escalamiento y de invenciones |
| `lib/agents/runner.ts` | Bucle del agente: lock, pasos, tool calls, costo y escalamiento |
| `lib/agents/dispatch.ts` | Encolado con debounce |
| `lib/agents/presets.ts` | Agente comercial por defecto, generico |

**Los guardrails viven en dos capas, y esto es lo importante de la fase.** El prompt pide
colaboracion al modelo; el codigo la impone:

| Regla de la spec | Como se aplica en codigo |
|---|---|
| No inventa precios ni stock | Una respuesta que afirma precio, stock o entrega **no se envia**: se escala y se audita |
| No confirma pagos | Misma deteccion; ademas a CUSTOMER solo se llega por pago verificado (Fase 1) |
| No responde en modo humano | El runner aborta antes de llamar al modelo |
| No ejecuta herramienta no autorizada | Lista blanca por version; el rechazo se le devuelve al modelo como resultado |
| No accede a otro workspace | El `workspaceId` lo pone el servidor y no es argumento de ninguna herramienta |
| Escala correctamente | Patrones de escalamiento se detectan **antes** de llamar al modelo: no cuesta tokens |
| Maximo de pasos por ejecucion | `maxSteps` corta el bucle; un run abortado no manda mensajes a medias |

Otras decisiones:

- **El agente nace en borrador.** Publicar es una accion separada y solo del OWNER: nadie deja una
  IA hablando con sus clientes sin haberla leido antes.
- **Solo una version publicada por agente**, garantizado por transaccion al publicar.
- **Un fallo del proveedor escala a humano.** Que OpenAI se caiga no puede dejar a un cliente
  esperando en silencio.
- **El contexto es resumen + ultimos 12 mensajes**, no la conversacion entera: mandarla completa
  es caro y casi nunca mejora la respuesta.
- **El costo se mide por workspace** en `UsageRecord`, que es la base de los limites de plan.
- Las instrucciones por defecto son **genericas**: no asumen rubro. Hay una prueba que lo verifica.

### Comercio y entrega digital (Fase 5)

| Archivo | Responsabilidad |
|---|---|
| `lib/commerce/orders.ts` | Catalogo y creacion de pedidos. **El precio lo pone el servidor** |
| `lib/commerce/checkout.ts` | Preferencia de Mercado Pago, recovery y registro idempotente de pagos |
| `lib/commerce/payment-webhook.ts` | Efectos de un pago de pedido, con validacion de monto y moneda |
| `lib/commerce/delivery.ts` | Concesion, resolucion, limites y reenvio de accesos digitales |

**La bifurcacion del webhook** era el riesgo anotado desde la Fase 0: el mismo endpoint atiende
la suscripcion al CRM y la compra de un producto. Sin distinguirlas, el primer infoproducto
vendido habria activado una suscripcion mensual gratis.

La discriminacion usa `metadata.kind`:

| Origen | `external_reference` | `metadata.kind` |
|---|---|---|
| Suscripcion al CRM | `workspaceId` | `subscription` |
| Compra de producto | `orderId` | `order` |

**Solo se trata como pedido lo que viene marcado explicitamente.** Las preferencias creadas antes
de la Fase 5 no llevan `kind` y son de suscripcion, asi que un pago en vuelo no cambia de
significado a mitad de camino. Hay una prueba que verifica que comprar un producto deja la
suscripcion del workspace intacta.

Otras decisiones:

- **El precio lo pone el servidor, siempre.** Ni el agente ni el cliente lo proponen: se manda el
  id de la variante y el backend calcula. Cada linea guarda snapshot de nombre, sku y precio, asi
  que cambiar el catalogo manana no reescribe lo que alguien ya pago. Probado.
- **Monto y moneda se validan contra el pedido.** Un pago aprobado por un monto distinto se
  rechaza y se audita, aunque la firma del webhook sea valida.
- **Un pago pendiente no entrega nada.** Se registra y se espera.
- **La entrega es idempotente por esquema**, no por cuidado del codigo: el unique
  `(orderId, assetId)` hace que diez reentregas del mismo pago dejen un solo acceso.
- **El token de entrega se guarda hasheado**, igual que una contrasena. Quien lea la base no
  obtiene accesos utilizables.
- **El agente NO tiene `create_digital_delivery`.** La spec la lista, pero conceder accesos a
  pedido del cliente es exactamente lo que no debe poder hacer una IA: la entrega la dispara el
  webhook verificado, y reenviar un acceso perdido es una accion humana.
- **`create_checkout` no viene habilitada por defecto.** Cobrar es un efecto material: el cliente
  lo activa cuando tiene catalogo y decide que su agente puede vender solo. Un negocio de
  servicios no quiere que la IA genere pedidos.

### Shopify (Fase 6)

| Archivo | Responsabilidad |
|---|---|
| `lib/shopify/oauth.ts` | State firmado, HMAC de callback y de webhooks, canje de token |
| `lib/shopify/client.ts` | Cliente de la Admin **GraphQL** API y consultas |
| `lib/shopify/sync.ts` | Sincronizacion de catalogo y consulta viva de variante |
| `lib/shopify/orders.ts` | Draft orders con verificacion de precio y stock |
| `lib/shopify/webhooks.ts` | Ingesta idempotente y aplicacion de 5 topics |

**Controles de seguridad del OAuth**, que hay que tener los tres juntos:

1. **`state` firmado** con nonce y vencimiento de 10 minutos. El nonce viaja ademas en una cookie
   httpOnly y el callback exige que coincidan: alguien con un state valido no puede completar el
   flujo desde otro navegador.
2. **HMAC de la query del callback**, sobre los parametros ordenados sin `hmac`. Agregar un
   parametro invalida la firma; hay una prueba que lo verifica.
3. **Validacion del dominio** contra `<tienda>.myshopify.com`. Sin esto, un `shop` arbitrario haria
   que el servidor negocie tokens contra un host cualquiera. La validacion se repite dentro de
   `exchangeCodeForToken`, que es quien hace la peticion saliente: hay una prueba que comprueba que
   con un dominio invalido **no se llega a llamar a `fetch`**.

Otras decisiones:

- **Se usa GraphQL, no REST.** La spec pide no depender de APIs obsoletas y Shopify viene
  retirando endpoints REST de productos y pedidos.
- **La tienda es la fuente de verdad.** La copia local sirve para listar y buscar rapido, pero
  antes de cada checkout se re-consulta precio e inventario. Una prueba verifica el ORDEN: la
  consulta viva ocurre antes del draft order.
- **Si el precio cambio entre la conversacion y el checkout, se aborta** y se le dice el precio
  nuevo al agente, en vez de cobrar distinto de lo conversado.
- **El HMAC de los webhooks va en base64**, no en hex como el de Meta. Es un detalle facil de
  equivocar; hay una prueba que rechaza la firma en hex.
- **La deduplicacion no usa `X-Shopify-Webhook-Id`**, que es unico por ENTREGA y no por evento: dos
  entregas del mismo pedido traen ids distintos. Se combina topic + shop + id del recurso.
- **La desinstalacion borra el token** en el acto. Los pedidos historicos se conservan: desconectar
  no es borrar los datos del cliente.
- **Un producto retirado de la tienda se archiva, no se borra**, porque puede estar referenciado
  por pedidos ya cobrados.
- Los productos sincronizados se marcan `PHYSICAL`: Shopify no distingue digital de fisico de
  forma fiable, y asumirlo mal romperia la entrega automatica.

### Cotizador (Fase 7)

| Archivo | Responsabilidad |
|---|---|
| `lib/quotes/schema.ts` | Lenguaje de reglas y validacion de los datos del cliente |
| `lib/quotes/engine.ts` | Calculo determinista. **Funcion pura**: no toca la base ni el reloj |
| `lib/quotes/service.ts` | Ciclo de vida: crear, revisar, aprobar, enviar, aceptar, versionar |
| `lib/quotes/pdf.ts` | Generacion de PDF sin dependencias |

**Las reglas son datos, no codigo.** Cada workspace describe su servicio en JSON: que campos pedir
(`intakeSchema`) y como calcular (`rules`). Un rubro nuevo no necesita un despliegue, y ningun
rubro queda hardcodeado — que es la restriccion multivertical aplicada al cotizador.

El lenguaje soporta seis tipos de componente: `FIXED`, `PER_UNIT`, `PER_AREA`, `TIERED`,
`SURCHARGE` y `DISCOUNT`, mas minimo y redondeo. Las condiciones **reutilizan el evaluador de la
Fase 3**: un operador nuevo sirve para automatizaciones y para precios a la vez.

**Como se garantiza que el LLM no altera el total:**

1. El agente llama a `collect_quote_inputs` para saber que preguntar.
2. Recolecta los datos y llama a `calculate_quote` con ellos.
3. El motor calcula y **guarda el total en la base**. Lo que el agente diga despues no cambia el
   numero guardado: hay una prueba que lo verifica explicitamente.
4. Nada se envia al cliente sin aprobacion humana.

Otras decisiones:

- **Faltan datos = no se calcula.** El error devuelve que campos faltan con su etiqueta, para que
  el agente pregunte en lenguaje natural en vez de pedir la clave tecnica.
- **Una cotizacion aprobada no se edita.** Aprobarla o rechazarla de nuevo devuelve error: el
  camino es crear una version, que conserva el numero e incrementa `version`. La anterior queda
  intacta y su PDF sigue sirviendo.
- **Solo OWNER y ADMIN aprueban**; publicar reglas de precio es solo del OWNER.
- **El PDF se genera al vuelo**, no se almacena: asi siempre corresponde a lo aprobado y no queda
  un archivo viejo circulando con numeros que ya no son.
- **Aceptar una cotizacion NO convierte en cliente.** Eso sigue exigiendo pago aprobado o
  confirmacion humana (regla de la Fase 1).

**Sobre el PDF sin dependencias:** se escribe el formato PDF 1.4 a mano (~120 lineas) en vez de
sumar `pdfkit` o `@react-pdf`, que traen decenas de megas y un runtime que mantener para un
documento que es texto en una pagina. El resultado es determinista —los mismos datos producen los
mismos bytes— y se verifico abriendolo en el navegador, no solo comprobando que el archivo existe.

### Recuperacion, email y campanas (Fase 8)

| Archivo | Responsabilidad |
|---|---|
| `lib/marketing/policy.ts` | **La unica puerta de envio**: consentimiento, silencio, topes y multicanal |
| `lib/marketing/segments.ts` | Lenguaje de filtros y resolucion, siempre sin suprimidos |
| `lib/marketing/journeys.ts` | Motor de secuencias: inscribe, avanza de a un paso, saca |
| `lib/marketing/enrollments.ts` | Salida de inscripciones, aparte para evitar un ciclo de imports |
| `lib/marketing/campaigns.ts` | Destinatarios materializados y envio por tandas |
| `lib/marketing/bootstrap.ts` | Politica, segmentos y journeys de fabrica de un workspace nuevo |
| `lib/email/provider.ts` | Interfaz `EmailProvider`: mandar, verificar dominio, firma y eventos |
| `lib/email/resend.ts` | Adaptador de Resend, con verificacion de firma Svix |
| `lib/email/scripted.ts` | Proveedor determinista: pruebas y workspaces sin email configurado |
| `lib/email/templates.ts` | Render, escapado y personalizacion con IA acotada |
| `lib/email/send.ts` | Camino de envio: una sola funcion, todas las comprobaciones |
| `lib/email/events.ts` | Webhook del proveedor: idempotencia, estados, supresion y scoring |
| `lib/email/unsubscribe.ts` | Baja desde el enlace, idempotente y atribuida a su campana |

**Una sola puerta.** Todo lo que escribe a un contacto pasa por `evaluateSend`. La alternativa
—que cada journey y cada campana recordara comprobar consentimiento, supresion, horario y
frecuencia— es exactamente el tipo de olvido que produce el envio indebido que la fase existe para
impedir.

**Quiet hours en la zona del workspace.** Un servidor en UTC no puede decidir si en Santiago son
las 22:00. El calculo convierte hora de pared a instante iterando sobre el desfase real de la
fecha, de modo que sobrevive al cambio de horario de verano; hay pruebas para el cambio de
septiembre en Chile y para el cruce de fin de mes.

**Un bloqueo reprograma, no consume el paso.** Si una inscripcion despierta de noche o el contacto
ya alcanzo su tope, `nextRunAt` se corre y `currentPosition` no se mueve. Consumir el paso
equivaldria a saltarse el mensaje en silencio, que es la falla que nadie detecta hasta que el
cliente pregunta por que no le escribieron.

**Los segmentos nunca se materializan.** Se guarda la definicion; el recuento es informativo y toda
campana reevalua en el momento del envio. Asi nadie recibe algo por haber quedado en una lista
vieja. La exclusion de suprimidos vive dentro del resolvedor y no en cada llamador, para que
construir un journey nuevo no dependa de acordarse.

**La IA rellena huecos, no escribe el email.** Un template declara `aiSlots` con su guia, su largo
maximo y su texto de respaldo; eso es lo unico que el modelo puede tocar. Una respuesta con un
enlace, HTML, un monto o un descuento se rechaza y queda el respaldo, y el rechazo se audita porque
significa que el modelo intento salirse. Es el mismo criterio de la Fase 7 con los totales.

**El token de baja no queda en claro en ninguna parte.** En la base vive su hash, y el cuerpo
guardado lleva un marcador `{{unsubscribe_url}}` que solo se sustituye por la URL real en lo que
sale hacia el proveedor. Guardar el cuerpo renderizado con el enlace dentro habria vuelto inutil
guardar solo el hash.

**Lo operacional no se frena.** Un aviso de compra no consume topes, no espera al amanecer y sale
aunque el dominio este todavia pendiente de verificar. Lo unico que lo detiene es la supresion.

### Scripts de apoyo creados

- `scripts/set-crm-db.mjs`: escribe `apps/crm/.env.production.local` a partir del connection
  string de Supabase, URL-encodea la password y **verifica la conexion antes de escribir**.
- `scripts/smoke-fase0.mjs`: pruebas de aceptacion de la Fase 0 (por HTTP).
- `apps/crm/scripts/smoke-fase1.ts`: pruebas de aceptacion de la Fase 1 (capa de dominio).
  Correr desde `apps/crm` con `pnpm exec tsx scripts/smoke-fase1.ts`.
- `apps/crm/scripts/smoke-fase2.ts` y `scripts/fixtures/whatsapp.ts`: pruebas de la Fase 2 con
  payloads que imitan los de Meta. No requieren credenciales.
- `apps/crm/scripts/smoke-fase3.ts`: pruebas de la Fase 3 (cola, condiciones, scheduler,
  idempotencia y aislamiento).
- `apps/crm/scripts/smoke-fase4.ts`: evals de la Fase 4 contra un proveedor guionado. No consume
  tokens ni requiere creditos.
- `apps/crm/scripts/smoke-fase5.ts`: pruebas de la Fase 5 (catalogo, pedidos, pagos, entrega e
  idempotencia). No requiere credenciales de Mercado Pago.
- `apps/crm/scripts/smoke-fase6.ts` y `scripts/fixtures/shopify.ts`: pruebas de la Fase 6 (OAuth,
  sincronizacion, draft orders y webhooks). No requiere tienda ni credenciales.
- `apps/crm/scripts/smoke-fase7.ts`: pruebas de la Fase 7 (motor, validacion, aprobaciones,
  versionado y PDF).
- `apps/crm/scripts/smoke-fase8.ts`: pruebas de la Fase 8 (politica, segmentos, journeys,
  email, campanas y baja). No requiere proveedor de email ni credenciales.

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

### B12 — El token de baja quedaba en claro dentro del cuerpo guardado — CORREGIDO (2026-09-11)

Lo detecto una prueba que se escribio para afirmar justo eso: que el token no aparece en la base.
`EmailMessage` guarda solo el hash del token, pero tambien guardaba el cuerpo renderizado del
correo, y el cuerpo llevaba el enlace completo. Guardar el hash no servia de nada: el token estaba
tres columnas mas alla, en texto plano.

**Correccion:** el cuerpo se guarda con un marcador `{{unsubscribe_url}}` y la URL real solo se
sustituye en lo que sale hacia el proveedor. El cuerpo guardado sigue sirviendo como evidencia de
que se envio, sin llevar dentro la llave. De paso, una plantilla puede colocar el marcador donde
quiera y entonces no se le agrega un segundo pie.

**Leccion:** guardar un secreto hasheado no protege nada si el mismo secreto viaja dentro de otro
campo de la misma fila. Vale la pena escribir la prueba que afirma la propiedad, no solo la que
comprueba que la columna del hash no es nula.

### B11 — El alta de un cliente excedia el limite de la transaccion — CORREGIDO (2026-09-11)

Lo detecto la suite al crear sus workspaces de prueba: `P2028`, transaccion expirada a los 5.5 s.
La Fase 8 sumo a `createCustomerWorkspace` la creacion de 8 segmentos, 4 journeys y sus 17 pasos,
todo dentro de la transaccion interactiva del registro. Cada journey era un viaje mas a la base
sobre el pooler, y el conjunto pasaba el limite de 5 segundos de Prisma.

No era un problema de la prueba: **el registro de un cliente real habria fallado igual**, de forma
intermitente y en el peor momento posible.

**Correccion:** la configuracion de recuperacion salio de la transaccion a `bootstrapMarketing`,
que corre despues del commit en tres escrituras masivas en vez de una por fila. Nada de eso forma
parte de la invariante "el cliente existe": si falla, el workspace queda operativo igual y la
funcion es idempotente, asi que basta volver a llamarla.

**Leccion:** una transaccion interactiva no es el lugar para datos de ejemplo. Lo que debe ser
atomico es el usuario, el workspace y su suscripcion; los presets pueden llegar un segundo despues.

### B10 — El enlace del PDF se perdia al aprobar la ultima cotizacion — CORREGIDO (2026-09-08)

Lo detecto la prueba manual en la interfaz, no la suite. El banner con el enlace del PDF se
renderizaba **despues** del early-return del estado vacio: al aprobar la ultima cotizacion
pendiente la cola quedaba vacia, el componente devolvia el estado vacio y el enlace desaparecia.

Y era peor que un problema visual: el token se muestra una sola vez y solo se guarda su hash, y
una cotizacion aprobada no se puede volver a aprobar. **El enlace se perdia para siempre.**

**Correccion en dos niveles:** el banner se movio antes del estado vacio, y se agrego
`POST /api/quotes/[id]/pdf-link` para regenerar el enlace de una cotizacion ya aprobada —accion de
owner/admin, auditada, que invalida el token anterior—, con su boton en el historial.

**Leccion:** un early-return por estado vacio puede descartar informacion que se acaba de generar.
Y cuando un secreto se muestra una sola vez, tiene que existir el camino para volver a obtenerlo.

### B9 — Cast a `never` que habria fallado en produccion — CORREGIDO (2026-09-08)

Al escribir el handler de desinstalacion de Shopify, `IntegrationProvider` no tenia el valor
`SHOPIFY`. Se uso `provider: 'SHOPIFY' as never` para que compilara: TypeScript quedaba contento y
**Prisma habria fallado en ejecucion** al recibir un valor que el enum de Postgres no acepta.

**Correccion:** se agrego `SHOPIFY` al enum (migracion `20260908150000`) y se reemplazo el cast por
`IntegrationProvider.SHOPIFY`.

**Leccion:** un `as never` o un `as any` para "que compile" en un valor de enum es un error en
diferido. Si el tipo no acepta el valor, casi siempre es porque el esquema tampoco.

### B7 — La cuenta de OpenAI no tiene creditos (abierto)

La API key entregada es valida —lista modelos correctamente y la cuenta tiene acceso a la familia
GPT-5— pero toda llamada de inferencia responde:

```
429 You have no credits remaining
```

La Fase 4 quedo completa y probada contra el proveedor guionado. Para validarla contra el modelo
real hay que cargar saldo (T12).

### B8 — Race en el lock de conversacion — CORREGIDO (2026-09-07)

Lo detecto la prueba de concurrencia de la Fase 4. `acquireLock` usaba un `upsert` de Prisma: dos
ejecuciones simultaneas sobre una conversacion sin estado previo intentaban insertar las dos y una
reventaba con `P2002` en vez de perder el lock limpiamente.

**Correccion:** una sola sentencia `INSERT ... ON CONFLICT DO UPDATE ... WHERE locked_until IS NULL
OR locked_until <= now()`. Si el lock vigente es de otro, no actualiza ninguna fila y no devuelve
nada, que es exactamente "no lo obtuve".

**Leccion:** el `upsert` de Prisma no es atomico frente a inserciones concurrentes. Para locks y
reservas hay que bajar a SQL.

### B6 — Fuga entre workspaces en las acciones de automatizacion — CORREGIDO (2026-09-07)

Lo detecto la propia suite de la Fase 3. La accion `CREATE_TASK` escribia
`activity.create({ workspaceId, contactId })` sin comprobar que el contacto perteneciera a ese
workspace. Prisma lo permite porque la clave foranea de `Activity.contactId` apunta a
`contacts(id)` y **no ata el par `(workspaceId, contactId)`**. Un evento que llegara con el
`contactId` de otro tenant creaba actividades en el workspace A referenciando un contacto de B.

**Correccion:** `buildContext` ahora devuelve `null` si el evento referencia un contacto,
conversacion u oportunidad que no es del workspace, y el motor descarta el evento entero y lo
audita como `automation.event_rejected_cross_tenant`. Se corrige en la raiz, no accion por accion.

**Leccion para las fases siguientes:** ninguna FK del esquema ata el tenant. Toda escritura que
reciba un id desde afuera debe validar pertenencia antes, aunque el `workspaceId` propio sea el
correcto.

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

### Fase 3

`pnpm exec tsx scripts/smoke-fase3.ts` desde `apps/crm`, ejecutado el 2026-09-07.

**Resultado: 46/46.**

| Area | Pruebas | Estado |
|---|---|---|
| Reglas por defecto al crear workspace (y que ninguna asuma un rubro) | 3 | 3/3 |
| Cola: encolar, dedupe, reclamar, no doble reclamo, completar | 5 | 5/5 |
| Reintentos con espera creciente y dead letter | 4 | 4/4 |
| Rescate de trabajos colgados por un worker caido | 2 | 2/2 |
| Condiciones AND, OR, anidadas, `in`, `contains`, campo inexistente | 9 | 9/9 |
| Ejecucion unica: seis corridas del mismo evento, sin duplicar tareas ni acciones | 4 | 4/4 |
| Aislamiento: evento que apunta a otro workspace | 5 | 5/5 |
| Horario valido para acciones futuras (quiet hours) | 2 | 2/2 |
| Scheduler: promueve y ejecuta vencidas, respeta las futuras | 2 | 2/2 |
| Cancelacion por opt-out y emision del evento | 3 | 3/3 |
| Runner de lote y metricas de cola | 3 | 3/3 |
| Emitir encola en vez de ejecutar en linea | 2 | 2/2 |
| Regla con acciones invalidas: se marca fallida sin romper el motor | 2 | 2/2 |

**Verificacion por HTTP** (con el CRM corriendo): activar una regla del catalogo devuelve 201,
pausarla 200, un preset inexistente 404, acciones invalidas 400, el worker sin secreto 401 y con
secreto correcto procesa el lote (`SCAN_SCHEDULED_ACTIONS`, `PROCESS_OUTBOX`, `SCAN_SILENCE`).
El health endpoint devuelve profundidad de cola y que integraciones estan configuradas, **sin
exponer ningun valor**.

**Verificacion en la interfaz:** `/automatizaciones` lista las reglas con su disparador, sus
acciones y su contador de ejecuciones, y ofrece el catalogo para activar mas.

Tras la Fase 3 se reejecutaron las suites anteriores: **Fase 2 en 46/46**, **Fase 1 en 41/41** y
**Fase 0 en 25/26**, sin regresiones.

### Fase 4

`pnpm exec tsx scripts/smoke-fase4.ts` desde `apps/crm`, ejecutado el 2026-09-07. Corre contra el
proveedor guionado: **no consume tokens ni requiere creditos**.

**Resultado: 70/70.**

| Area | Pruebas | Estado |
|---|---|---|
| Agente por defecto: existe, nace en borrador, es generico, sin herramientas de fases futuras | 5 | 5/5 |
| Guardrails puros: escalamiento, deteccion de invenciones, armado de instrucciones | 10 | 10/10 |
| No responde en modo humano (sin llamar al modelo) | 3 | 3/3 |
| Respuesta normal: mensaje, run, tokens, costo, latencia, consumo | 7 | 7/7 |
| **No inventa precio**: la respuesta se bloquea, escala y se audita | 5 | 5/5 |
| **No confirma pagos** ni convierte en cliente | 2 | 2/2 |
| Escalamiento inmediato sin gastar tokens | 3 | 3/3 |
| Herramienta no autorizada: no se ejecuta, se audita, el modelo recibe el rechazo | 4 | 4/4 |
| Herramientas autorizadas: se ejecutan y quedan registradas | 6 | 6/6 |
| Limite de pasos corta el bucle sin mandar mensajes a medias | 3 | 3/3 |
| Aislamiento: no corre sobre conversaciones de otro workspace | 3 | 3/3 |
| **Inyeccion de `workspaceId` en los argumentos**: el servidor manda | 2 | 2/2 |
| Lock: dos ejecuciones simultaneas, una sola respuesta | 2 | 2/2 |
| Debounce: tres mensajes seguidos, un solo trabajo | 3 | 3/3 |
| Sin version publicada no corre nada | 2 | 2/2 |
| Fallo del proveedor escala a humano y se audita | 3 | 3/3 |
| Configuracion, costos y specs de herramientas | 7 | 7/7 |

**Por que guionado y no contra OpenAI:** un guardrail probado contra un modelo real produce una
prueba que "a veces pasa". Contra un guion, cada fallo significa exactamente una cosa. Ademas la
cuenta no tiene creditos (T12). Cuando los tenga, el simulador (`POST /api/agents/[id]/test`)
permite la prueba manual contra el modelo real sin tocar a ningun cliente.

Tras la Fase 4 se reejecutaron las suites anteriores: **Fase 3 en 46/46**, **Fase 2 en 46/46** y
**Fase 1 en 41/41**, sin regresiones.

### Fase 5

`pnpm exec tsx scripts/smoke-fase5.ts` desde `apps/crm`, ejecutado el 2026-09-08 contra la base
real. No requiere credenciales de Mercado Pago: se inyectan los estados de pago que entregaria el
proveedor tras la re-consulta.

**Resultado: 70/70.**

| Area | Pruebas | Estado |
|---|---|---|
| Catalogo: activos visibles, borradores ocultos, aislamiento entre workspaces | 4 | 4/4 |
| Pedidos: el total lo calcula el servidor, snapshot de precio inmune a cambios de catalogo | 5 | 5/5 |
| Validaciones: sin lineas, producto de otro workspace, producto agotado | 3 | 3/3 |
| **Discriminacion suscripcion vs pedido**, incluida la compatibilidad hacia atras | 4 | 4/4 |
| **Pago pendiente no entrega** ni convierte en cliente | 5 | 5/5 |
| **Monto y moneda adulterados son rechazados** y auditados | 5 | 5/5 |
| Pago aprobado: pedido, pago, fulfillment, acceso, cliente, oportunidad, actividad, recovery | 9 | 9/9 |
| **Pago duplicado (10 reentregas) no duplica entrega** ni pagos ni fulfillments | 4 | 4/4 |
| Acceso digital: token hasheado, reenvio, limite de descargas, vencimiento, revocacion | 9 | 9/9 |
| Aislamiento en pedidos, pagos y entregas | 4 | 4/4 |
| Idempotencia de `upsertPayment` | 4 | 4/4 |
| Herramientas del agente y no filtracion del enlace de entrega | 8 | 8/8 |

**Prueba clave de la fase:** comprar un producto deja la suscripcion del workspace en `TRIAL` y
sin `mpPaymentId`. Es exactamente el riesgo que la Fase 0 dejo anotado.

**Verificacion en la interfaz:** `/pedidos` muestra los pedidos con su estado (Esperando pago /
Entregado), total y contador de accesos. La pagina publica `/d/[token]` redirige al destino con un
token valido y devuelve 404 con uno inventado.

Tras la Fase 5 se reejecutaron las suites anteriores: **Fase 4 en 71/71**, **Fase 3 en 46/46**,
**Fase 2 en 46/46** y **Fase 1 en 41/41**, sin regresiones.

La suite de la Fase 4 requirio un ajuste, no una correccion: usaba `search_products` como ejemplo
de herramienta no autorizada, y el agente por defecto ahora la tiene. Se cambio por
`create_checkout`, que sigue fuera del default a proposito.

### Fase 6

`pnpm exec tsx scripts/smoke-fase6.ts` desde `apps/crm`, ejecutado el 2026-09-08. Usa fixtures de
la Admin API: **no requiere tienda de desarrollo ni credenciales**.

**Resultado: 74/74.**

| Area | Pruebas | Estado |
|---|---|---|
| Validacion de dominio (defensa contra SSRF): 6 formas de burlarla | 6 | 6/6 |
| `state` del OAuth: firma, workspace, nonce, secreto ajeno, manipulacion, vencimiento, URL | 10 | 10/10 |
| HMAC del callback: valido, invalido, ausente, parametro inyectado | 4 | 4/4 |
| **El canje de token no sale a la red con un dominio invalido** | 1 | 1/1 |
| HMAC de webhooks: base64 valido, hex rechazado, cuerpo alterado, sin cabecera | 4 | 4/4 |
| **El token nunca sale en claro** ni llega al objeto que va al navegador | 3 | 3/3 |
| Sincronizacion: productos, variantes, precio, inventario, no duplica al repetir, archiva retirados | 9 | 9/9 |
| Consulta viva y **producto agotado no se vende** | 5 | 5/5 |
| **Cambio de precio entre conversacion y checkout**: aborta y audita | 3 | 3/3 |
| Draft order: total del precio vivo, orden de las llamadas, no duplica | 7 | 7/7 |
| **Webhook duplicado**: 6 entregas, un pedido, un pago; aislamiento; tienda desconocida | 12 | 12/12 |
| Pedido pendiente no confirma ni registra pago | 2 | 2/2 |
| Fulfillment: estado y seguimiento | 3 | 3/3 |
| **Desinstalacion**: revoca, borra el token, no toca la otra tienda | 5 | 5/5 |

Dos pruebas que vale la pena destacar por lo que verifican:

- **El orden de las llamadas.** No basta con que se consulte el precio: se comprueba que la
  consulta viva ocurre ANTES de crear el draft order. Si alguien invierte el orden mas adelante,
  la prueba falla.
- **El canje de token con dominio invalido.** Se inyecta un `fetch` falso y se verifica que **no
  llega a llamarse**. Comprobar el resultado no bastaria: lo que importa es que el servidor no
  haga la peticion saliente.

Tras la Fase 6 se reejecutaron las suites anteriores: **Fase 5 en 70/70**, **Fase 4 en 71/71**,
**Fase 3 en 46/46**, **Fase 2 en 46/46** y **Fase 1 en 41/41**, sin regresiones.

### Fase 7

`pnpm exec tsx scripts/smoke-fase7.ts` desde `apps/crm`, ejecutado el 2026-09-08.

**Resultado: 79/79.**

| Area | Pruebas | Estado |
|---|---|---|
| Motor: calculos conocidos a mano, recargo condicional, minimo, redondeo, determinismo | 10 | 10/10 |
| Validacion de entrada: faltantes, tipos, rangos, opciones, decimales con coma | 8 | 8/8 |
| Crear cotizacion: **datos faltantes bloquean el calculo**, numeracion, desglose, revision automatica | 10 | 10/10 |
| **Solo roles autorizados aprueban** | 2 | 2/2 |
| Aprobacion: estado, revisor, token hasheado, cola | 6 | 6/6 |
| **El PDF corresponde a los datos aprobados** y es determinista | 6 | 6/6 |
| Recuperacion del enlace del PDF | 3 | 3/3 |
| **Aprobada no se edita: crea version**; la anterior queda intacta | 8 | 8/8 |
| Envio y aceptacion; aceptar NO convierte en cliente | 4 | 4/4 |
| Aislamiento entre workspaces | 4 | 4/4 |
| Solo se cotiza con reglas PUBLICADAS | 2 | 2/2 |
| Herramientas del agente: **el total en la base es el del motor** | 11 | 11/11 |

**La prueba central de la fase:** el agente llama a `calculate_quote`, recibe un total, y se
verifica que **el total guardado en la base es el que produjo el motor**. Es la forma de comprobar
que la regla "el LLM no realiza la aritmetica" se cumple de verdad, no solo en el prompt.

**Verificacion end-to-end en el navegador:** se cargo un servicio con reglas reales, se generaron
dos cotizaciones desde el motor, se aprobaron desde la cola de revision, se recupero el enlace del
PDF y se abrio el PDF, comprobando que muestra el total aprobado y que un token inventado devuelve
404.

Tras la Fase 7 se reejecutaron las suites anteriores: **Fase 6 en 74/74**, **Fase 5 en 70/70**,
**Fase 4 en 72/72**, **Fase 3 en 46/46**, **Fase 2 en 46/46** y **Fase 1 en 41/41**, sin
regresiones.

### Fase 8

`pnpm exec tsx scripts/smoke-fase8.ts` desde `apps/crm`, ejecutado el 2026-09-11.

**Resultado: 142/142.**

| Area | Pruebas | Estado |
|---|---|---|
| Zona horaria y quiet hours: horario de verano, fin de mes, ida y vuelta | 10 | 10/10 |
| Consentimiento, **tope de frecuencia** y regla multicanal | 10 | 10/10 |
| **Los segmentos excluyen a los suprimidos**; la lista de suprimidos no es enviable | 13 | 13/13 |
| Plantillas: escapado, placeholders y **la IA no se sale del template** | 17 | 17/17 |
| Envio: dominio verificado, enlace de baja obligatorio, token fuera de la base | 18 | 18/18 |
| **La baja cancela acciones, saca de journeys y suprime** | 10 | 10/10 |
| Webhook: firma, ventana de tiempo, idempotencia y estados que no retroceden | 15 | 15/15 |
| **Rebote permanente suprime**; el transitorio no | 4 | 4/4 |
| Journeys: **quiet hours reprograman**, **un pago saca de la recuperacion** | 30 | 30/30 |
| Campanas: lista sin suprimidos, motivos de omision, metricas | 13 | 13/13 |
| Scoring explicable con señales de email | 6 | 6/6 |

**Las seis pruebas que la spec exige para la fase** estan todas cubiertas y nombradas tal cual:
segmentos excluyen suprimidos, desuscripcion cancela acciones pendientes, pago saca al contacto de
recuperacion, quiet hours reprograma, frequency cap impide exceso, rebote permanente suprime email.

**La prueba central de la fase:** en quiet hours la inscripcion **no avanza de paso**. Se comprueba
que `currentPosition` sigue igual, que `stepsCompleted` sigue en cero y que el proveedor no recibio
nada. Un journey que "respeta el horario" saltandose el mensaje seria peor que uno que no lo
respeta, porque el fallo es invisible.

**Verificacion end-to-end en el navegador:** se cargo un workspace con dominio verificado, plantilla
publicada y contactos; se envio un email real por el proveedor guionado y se abrio su enlace de
baja. Se comprobo que **abrir la pagina no da de baja a nadie** (el consentimiento seguia GRANTED),
que confirmar si lo hace, y que despues de confirmar el contacto **desaparece de todos los
segmentos enviables** —el preview del segmento de leads calientes paso a cero— mientras aparece en
el de suprimidos, que es de solo consulta. Tambien se pauso y se publico un journey desde la
interfaz y se rechazo una zona horaria inexistente.

Tras la Fase 8 se reejecutaron las suites anteriores: **Fase 7 en 79/79**, **Fase 6 en 74/74**,
**Fase 5 en 70/70**, **Fase 4 en 72/72**, **Fase 3 en 46/46**, **Fase 2 en 46/46** y
**Fase 1 en 41/41**, sin regresiones.

---

## 7. Deuda tecnica

| # | Item | Impacto |
|---|---|---|
| D1 | Sin rate limiting en `/api/auth/login`, la captura publica (CORS `*`) ni el webhook de WhatsApp | Seccion 15 de la spec lo exige antes de beta publica |
| D2 | Sin runner de tests formal (Vitest/Jest): las suites son scripts ejecutables por fase | Conviene consolidarlas antes de la Fase 10 |
| D3 | ~~Sin pruebas de aislamiento entre workspaces~~ — cubierto por `smoke-fase0.mjs` | — |
| D4 | ~~Sin cifrado de tokens de integracion~~ — resuelto en la Fase 2 con `lib/crypto.ts` (AES-256-GCM). Queda migrar `Integration.config`, que sigue en JSON plano | Fase 6 |
| D5 | ~~Sin cola durable ni scheduler~~ — resuelto en la Fase 3 |
| D6 | ~~Regla de automatizacion hardcodeada~~ — resuelta en la Fase 3 con el motor `trigger -> conditions -> actions` |
| D7 | "Insights IA" sigue siendo scoring heuristico. El agente de la Fase 4 es otra cosa: no genera insights | Conectar el agente a los insights, o retirar la pagina |
| D8 | 6 de 10 proveedores de `Integration` siguen siendo solo estado en BD. WhatsApp (F2), Mercado Pago (F5) y Shopify (F6) ya operan de verdad | Fase 8 |
| D9 | ~~`ContactStatus` mezcla ciclo de vida con intencion~~ — resuelto en la Fase 1. Queda la deuda menor de **retirar `status`** una vez que la UI consuma `lifecycleStatus` | Fase 9 o antes |
| D10 | Fallback demo (`admin@upzites.cl` / `demo1234`) activo cuando `NODE_ENV !== production` | Acotado, pero revisar antes de pilotos |
| D11 | Formulario de perfil del workspace en `/configuracion` es `readOnly` con boton deshabilitado | Fase 9 |
| D12 | Sin `AGENTS.md` ni `CLAUDE.md` en el repositorio | Conviene crearlos |
| **D13** | **Un ID de otro workspace en `PATCH`/`DELETE /api/contacts/[id]` devuelve 500 en vez de 404.** El dato esta protegido (`where: { id, workspaceId }`), pero el `P2025` de Prisma no se captura | Exigido por la matriz de pruebas (seccion 18 de la spec). Revisar tambien `opportunities`, `activities` y `pipeline-stages`, que siguen el mismo patron |
| **D14** | Desarrollo local apunta al **mismo** proyecto Supabase que produccion | Un error en dev afecta datos reales. Crear un segundo proyecto Supabase para dev |
| ~~D15~~ | ~~El webhook procesa en linea~~ — resuelto: ahora encola `PROCESS_WEBHOOK_EVENT` y responde 200 sin esperar |
| **D16** | Sin descarga de media (imagenes, audio, documentos): se guarda el payload con el id de Meta, no el archivo | La spec pide almacenamiento privado con URLs firmadas. Fase 3 o 10 |
| **D17** | Sin envio de plantillas aprobadas: fuera de la ventana de 24h la bandeja avisa pero no permite responder | Requiere dar de alta las plantillas en Meta (T9) |
| ~~D18~~ | ~~Sin debounce ni lock por conversacion~~ — resueltos en la Fase 4 |
| **D19** | El cron de Vercel corre **una vez al dia en plan Hobby**. Con ese plan los seguimientos no corren solos | Requiere Vercel Pro o `pg_cron` + `pg_net` en Supabase (T11) |
| **D20** | El endpoint `/api/internal/run-jobs` no tiene rate limiting propio; depende solo del secreto | Junto con D1, antes de la beta publica |
| **D21** | `pruneFinishedJobs` existe pero no lo llama ningun recurrente: la tabla `jobs` crece | Agregar al cron o a un barrido diario |
| **D22** | El agente no genera ni actualiza el `summary` de la conversacion: se manda resumen + 12 mensajes, pero nadie escribe el resumen | Conversaciones largas van a perder contexto. Fase 10 o antes |
| **D23** | Sin agente ROUTER: hay un solo agente publicado por workspace | Llega cuando existan los agentes de cotizacion y postventa (Fases 5 y 7) |
| **D24** | Los costos por token estan hardcodeados en `provider.ts` con una tarifa unica | Al fijar precios de plan hay que tarifar por modelo |
| **D25** | La deteccion de invenciones es por patrones de texto en español. Un modelo que diga "sale cuarenta mil" la esquiva | Es una red de seguridad, no la unica: el precio real solo sale de `search_products` |
| **D26** | Los assets digitales tipo FILE guardan una ruta, pero **no hay almacenamiento de archivos**: hoy solo funcionan LINK y CODE | La spec pide almacenamiento privado con URLs firmadas. Fase 10 o antes |
| **D27** | Sin devoluciones ni reembolsos: un pago `REFUNDED` se registra pero no revoca el acceso ni revierte el estado del contacto | Necesario antes de vender en volumen |
| **D28** | El upsell y la recompra postventa no estan: el pago crea la actividad pero no programa nada | La spec los pide en la seccion 9.7. Fase 8 |
| **D29** | La entrega digital no se ENVIA: se genera el acceso, pero nadie manda el enlace por WhatsApp o email | Falta conectar la entrega al outbox. Bloquea el criterio "sin intervencion humana" (T14) |
| **D30** | La sincronizacion de Shopify no se agenda sola: hay que dispararla desde la UI o por API | Agregar `SYNC_SHOPIFY_CATALOG` a los recurrentes del cron |
| **D31** | Los webhooks de Shopify no se registran automaticamente al conectar: hay que darlos de alta en la app | Se puede automatizar con `webhookSubscriptionCreate` en el callback |
| **D32** | Los productos de Shopify se marcan `PHYSICAL` siempre: un infoproducto vendido por Shopify no dispararia entrega digital | Requiere mapear por tipo de producto o etiqueta. Fase 9 (onboarding) |
| **D33** | Sin manejo de rate limit de Shopify (cost-based): una tienda grande puede toparse con el limite durante la sincronizacion | La cola reintenta, pero conviene respetar `throttleStatus` |
| **D34** | No hay UI para crear ni editar reglas de precio: se cargan por API | Bloquea el onboarding autoservicio. Fase 9 |
| **D35** | Las cotizaciones vencidas no pasan solas a EXPIRED: `validUntil` se guarda pero nadie lo barre | Agregar al cron, junto con los recurrentes de la Fase 3 |
| **D36** | El PDF no lleva logo ni colores del workspace: solo el nombre | La spec pide "branding basico"; falta almacenamiento de imagenes (D26) |
| **D37** | El seguimiento de cotizacion pendiente (1/3/7 dias, spec 9.6) no esta cableado a `ScheduledAction` | **Resuelto en la Fase 8**: es el journey `cotizacion-pendiente` |
| **D38** | No hay UI para crear ni editar segmentos, journeys, plantillas ni campanas: se cargan por API | La pagina `/recuperacion` muestra y enciende, no edita. Bloquea el onboarding autoservicio (Fase 9) |
| **D39** | Una campana grande se envia de a 50 por tanda sin control de velocidad del proveedor | Resend tiene limite por segundo; con listas de miles conviene espaciar las tandas |
| **D40** | Un contacto entra una sola vez a cada journey: no hay reinscripcion | La spec la deja como "reactivacion futura configurable". La unicidad en base lo impide a proposito |
| **D41** | `maxConsecutiveNoReply` se guarda pero todavia no se aplica | Los journeys de fabrica ya acotan los intentos por diseno; el tope generico falta |
| **D42** | El journey pausado reintenta cada hora en vez de dormir hasta que lo reactiven | Cuesta una consulta por inscripcion por hora. Aceptable en la beta, no a escala |
| **D43** | El scoring por envejecimiento sigue dependiendo de que algo dispare el recalculo | Hay `RECALCULATE_SCORE` en la cola pero ningun barrido periodico lo encola |

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
| T10 | Generar `INTEGRATION_ENCRYPTION_KEY` e `INTERNAL_WORKER_SECRET` para Vercel | Sin la primera no se pueden guardar tokens; sin la segunda el cron responde 401 y **nada se procesa** |
| T11 | Decidir como corre el cron: Vercel Pro (cron por minuto) o `pg_cron` + `pg_net` en Supabase | En plan Hobby el cron corre 1 vez al dia y los seguimientos no funcionan (D19) |
| T12 | **Cargar creditos en OpenAI** y definir un limite de gasto del proyecto | Sin creditos el agente no puede responder en produccion (B7) |
| T13 | **Rotar la API key de OpenAI**: circulo por el chat | Igual que la password de Postgres (T5) |
| T14 | Definir como llega el enlace de entrega al cliente: mensaje de WhatsApp, email, o ambos | Hoy el acceso se genera pero no se envia solo (D29) |
| T15 | Cargar el catalogo del piloto de infoproductos y habilitar `create_checkout` en su agente | Sin catalogo el agente deriva; sin la herramienta no puede cerrar la venta |
| T16 | **Crear la app en Shopify Partners** y entregar `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Valida la Fase 6 contra una tienda real; hoy solo esta probada con fixtures |
| T17 | Definir las reglas de precio reales del piloto de servicios y publicarlas | Sin reglas publicadas el agente no puede cotizar; se cargan por `POST /api/pricing-rule-sets` |
| T18 | **Crear la cuenta de Resend** y entregar `RESEND_API_KEY` y `EMAIL_WEBHOOK_SECRET` | Sin esto el email queda en el proveedor guionado: se registra pero no sale |
| T19 | **Verificar el dominio de envio** del piloto: registrarlo y publicar los registros DNS | Ningun email promocional sale desde un dominio sin verificar. Es una decision de DNS, no de codigo |
| T20 | Revisar y aprobar los textos de los 4 journeys de fabrica antes de publicarlos | Nacen en borrador a proposito: publicarlos es empezar a escribirle a clientes reales |
| T21 | Confirmar la zona horaria y los topes de contacto del piloto | Por defecto America/Santiago, 20:30-09:00, 1 WhatsApp/dia y 3 emails/semana. Se ajustan en `PATCH /api/messaging-policy` |

---

## 10. Variables de entorno pendientes por fase

| Variable | Fase | Obligatoria para |
|---|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | 0 / 5 | Cobro de suscripcion y de productos |
| `INTEGRATION_ENCRYPTION_KEY` | 2 | Cifrado de tokens de integracion. **Ya implementada**; generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `INTERNAL_WORKER_SECRET` | 2 y 3 | Protege `/api/internal/*` y autentica al cron. **Ya implementada**: sin ella la cola no se procesa |
| `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | 2 | WhatsApp Cloud API. **Ya implementadas**: sin ellas el webhook rechaza todo |
| `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_SYSTEM_ACCESS_TOKEN` | 2 | Opcionales: version de Graph API (por defecto v21.0) y token de sistema para pilotos |
| `META_APP_ID`, `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | 9 | Embedded Signup; hasta entonces el numero se conecta a mano |
| `OPENAI_API_KEY` | 4 | Agentes IA. **Ya implementada**; sin ella el agente no corre |
| `OPENAI_PROJECT_ID`, `OPENAI_DEFAULT_MODEL` | 4 | Opcionales: proyecto para atribuir gasto y modelo por defecto (hoy `gpt-5-mini`) |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | 6 | Shopify. **Ya implementadas**: sin ellas la conexion devuelve 503 |
| `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES`, `SHOPIFY_API_VERSION` | 6 | Opcionales: URL publica, scopes minimos y version de la Admin API (2025-01) |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET` | 8 | Email marketing |

`src/lib/env.ts` debera distinguir variables obligatorias para arrancar de variables que solo
habilitan una integracion: una integracion sin configurar aparece inactiva, no tumba el CRM.

---

## 11. Diferencias entre el repositorio y la especificacion

Resumen del informe de la Fase 0. Detalle por fase en la spec.

**Modelo de datos:** 60 tablas. Mensajeria: hecha (5/5). Agentes IA: hecha (4/4). Comercio: hecho
(7/7, mas `DigitalAsset` y `DigitalDelivery`), con los dos proveedores. Cotizaciones: hecho (4/4).
De marketing y seguimiento: **completo**. Consentimiento, scoring, supresion, scheduled actions,
el motor de automatizaciones y ahora segmentos, journeys y campanas. **Con esto no queda nada
pendiente del modelo de datos de la spec.** Uso y costos: hecho.

**Herramientas del agente:** 20 de las 21 que lista la spec, todas implementadas.
`create_digital_delivery` **no se implementara como herramienta**: la entrega la dispara el webhook
verificado, no el agente. `create_checkout` y las de cotizacion existen pero no vienen habilitadas
por defecto: cobrar y cotizar son efectos que el cliente activa a proposito.

**Enums:** completos. Los 8 que exige la spec estan creados, mas 4 de apoyo. `ContactStatus`
convive con `LifecycleStatus` mediante backfill y espejo automatico; se retira cuando la UI
consuma el campo nuevo.

**Infraestructura:** outbox, reintentos, dead-letter, cola durable y scheduler estan
implementados. Faltan los locks por conversacion y el debounce, que recien importan cuando
responde la IA (Fase 4).

**Seguridad:** el cifrado de tokens quedo resuelto en la Fase 2. Faltan rate limiting y CSRF
general. Los tres webhooks —Meta, Mercado Pago y Shopify— cumplen el estandar de la spec: firma
validada sobre el cuerpo crudo, idempotencia y validacion de monto donde aplica. El OAuth de
Shopify agrega state firmado con nonce en cookie, que es CSRF especifico de ese flujo.

**Se preserva y reutiliza:** auth y roles, multi-tenancy por `workspaceId`, captura web,
pipeline, actividades, atribucion UTM, billing de suscripcion y audit log.

**Correccion a la spec — resuelta en la Fase 5.** El webhook asumia que *todo* pago aprobado era
una suscripcion. Se bifurco por `metadata.kind`, tratando como pedido solo lo marcado
explicitamente para no cambiarle el significado a un pago en vuelo. Hay una prueba dedicada.

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
| 2026-09-11 | **Una sola puerta de envio**: journeys, campanas y avisos operativos pasan todos por `evaluateSend`. La alternativa —que cada llamador recuerde comprobar consentimiento, horario y frecuencia— es exactamente el olvido que produce el envio indebido |
| 2026-09-11 | Un bloqueo por horario o por tope **reprograma la inscripcion, no consume el paso**. Consumirlo seria saltarse el mensaje en silencio, y ese fallo no lo detecta nadie hasta que el cliente pregunta por que no le escribieron |
| 2026-09-11 | Los segmentos **no se materializan**: se guarda la definicion y toda campana reevalua al enviar. El recuento es informativo. Nadie recibe algo por haber quedado en una lista vieja |
| 2026-09-11 | La exclusion de suprimidos vive **dentro del resolvedor**, no en cada llamador: construir un journey nuevo no puede depender de que alguien se acuerde de filtrar |
| 2026-09-11 | Lo **operacional no se frena**: un aviso de compra no consume topes ni espera al amanecer. Frenarlo por un tope de marketing seria peor que el problema que el tope resuelve. Lo unico que lo detiene es la supresion |
| 2026-09-11 | La IA **rellena huecos declarados** (`aiSlots`), no escribe el email. Un enlace, un monto o un descuento inventado se rechaza y queda el respaldo. Mismo criterio que con los totales en la Fase 7 |
| 2026-09-11 | El cuerpo guardado lleva un **marcador** de baja, no la URL: guardar solo el hash del token no sirve si el token viaja en otra columna de la misma fila |
| 2026-09-11 | Los 4 journeys de fabrica nacen en **DRAFT**. Publicar significa empezar a escribirle a clientes reales, igual que con el agente de la Fase 4 |
| 2026-09-11 | Un contacto entra **una sola vez** a cada journey. La unicidad en base es lo que garantiza que un barrido repetido no vuelva a escribirle; reinscribir es una decision de producto que la spec deja para despues |
| 2026-09-08 | Las reglas de precio son **datos en JSON, no codigo**. Un rubro nuevo se configura sin desplegar, y ningun rubro queda hardcodeado: es la restriccion multivertical aplicada al cotizador |
| 2026-09-08 | El PDF se genera **sin dependencias**, escribiendo el formato a mano. `pdfkit` o `@react-pdf` traen decenas de megas y un runtime que mantener para un documento de una pagina. El resultado es determinista y se verifico abriendolo en el navegador |
| 2026-09-08 | El PDF se genera al vuelo en cada peticion en vez de almacenarse: asi siempre corresponde a lo aprobado y no queda un archivo viejo circulando con numeros que ya no son |
| 2026-09-08 | Las condiciones del cotizador reutilizan el evaluador de automatizaciones de la Fase 3 en vez de tener su propio lenguaje. Un operador nuevo sirve para las dos cosas |
| 2026-09-08 | Para Shopify se usa la Admin **GraphQL** API, no REST: la spec pide no depender de APIs obsoletas y Shopify viene retirando los endpoints REST de productos y pedidos |
| 2026-09-08 | La copia local del catalogo Shopify sirve para listar, pero **antes de cada checkout se re-consulta precio y stock**. Una prueba verifica el orden de las llamadas, no solo que se consulte |
| 2026-09-08 | Si el precio cambio entre la conversacion y el checkout, se aborta y se le informa al agente el precio nuevo. Cobrar distinto de lo conversado es peor que perder la venta |
| 2026-09-08 | Los productos sincronizados de Shopify se marcan PHYSICAL. Shopify no distingue digital de fisico de forma fiable, y asumirlo mal dispararia entregas que no corresponden |
| 2026-09-08 | La discriminacion del webhook trata como pedido SOLO lo marcado con `metadata.kind = order`. Lo no marcado se asume suscripcion, que es el comportamiento anterior: asi un pago creado antes de la Fase 5 no cambia de significado a mitad de camino |
| 2026-09-08 | `create_digital_delivery` NO se implementa como herramienta del agente pese a estar en la spec. Conceder accesos a pedido del cliente es precisamente lo que una IA no debe poder hacer: la entrega la dispara el webhook verificado y el reenvio es una accion humana |
| 2026-09-08 | `create_checkout` no viene en la lista blanca del agente por defecto. Cobrar es un efecto material que el cliente habilita a proposito; un negocio de servicios no quiere que la IA genere pedidos |
| 2026-09-08 | Los productos del piloto de infoproductos son datos de un workspace, no codigo. La spec los nombra, pero hardcodearlos romperia la regla multivertical |
| 2026-09-07 | Los evals de la Fase 4 corren contra un proveedor guionado, no contra OpenAI. Un guardrail probado contra un modelo real da una prueba no determinista; ademas la cuenta no tiene creditos. El simulador cubre la prueba manual contra el modelo real |
| 2026-09-07 | Los guardrails se aplican en el codigo, no solo en el prompt. Un prompt es una peticion al modelo, no un control de seguridad: la lista blanca de herramientas, el bloqueo de respuestas con precios y el corte por modo humano ocurren en el runner |
| 2026-09-07 | El agente nace en borrador y solo el OWNER publica. Dejar una IA hablando con los clientes es una decision del dueno del negocio, no un efecto secundario de crear la cuenta |
| 2026-09-07 | **Cola en tabla propia en vez de pgmq**, pese a ser la primera preferencia de la spec. Razones en la seccion 2: coherencia con las dos colas que ya existen, observabilidad por workspace sin SQL crudo, y no depender de una extension. Migrar a pgmq mas adelante solo toca `lib/jobs/queue.ts` |
| 2026-09-07 | Una automatizacion NO puede convertir a alguien en cliente: `SET_LIFECYCLE` excluye CUSTOMER y REPEAT_CUSTOMER. Solo un pago aprobado o una confirmacion humana lo hacen |
| 2026-09-07 | El motor descarta el evento completo si referencia datos de otro workspace, en vez de ejecutar las reglas con contexto parcial. Un contexto incompleto haria que las condiciones evaluaran contra `undefined` y las acciones escribieran igual |
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

### 2026-09-07 — Fase 3, cola, scheduler y automatizaciones reales

- Verificado que `pgmq` y `pg_cron` estan disponibles pero no instalados; se opto por una cola en
  tabla propia con `FOR UPDATE SKIP LOCKED` y se documento por que.
- 2 tablas y 3 enums nuevos; `AutomationTrigger` paso de 4 a 13 valores y `AutomationAction` de 4
  a 13. Migracion `20260907160000_fase3_cola_automatizaciones`, aditiva.
- Motor `trigger -> conditions -> actions` con condiciones AND/OR anidadas y 12 acciones tipadas.
- Catalogo de 7 reglas predefinidas, genericas; 4 se activan al crear el workspace.
- El webhook de WhatsApp dejo de procesar en linea: ahora encola (cierra D15).
- Eventos del dominio conectados: lead nuevo, mensaje recibido, mensaje fallido, pago confirmado y
  consentimiento revocado.
- Observabilidad: health con profundidad de cola y estado de configuracion, Ops con trabajos
  muertos y envios fallidos.
- **Hallazgo de seguridad corregido (B6):** las acciones escribian `contactId` sin validar
  pertenencia al workspace. Lo encontro la propia suite de la fase.
- Pruebas: **46/46**. Fases 2, 1 y 0 sin regresiones. Build, lint y tsc limpios.
- **Fase 3 cerrada.**

### 2026-09-07 — Fase 4, agentes IA y herramientas

- Verificados los modelos disponibles en la cuenta antes de fijar el default (`gpt-5-mini`).
- Detectado B7: la cuenta de OpenAI **no tiene creditos**; toda inferencia responde 429.
- 4 tablas y 3 enums nuevos; dos migraciones aditivas.
- Capa de agentes: proveedor intercambiable, 9 herramientas tipadas, guardrails en dos capas,
  runner con lock y limite de pasos, debounce de 3 s, simulador y publicacion versionada.
- El agente se conecta al mensaje entrante y a la accion `RUN_AGENT` del motor de la Fase 3.
- **Hallazgo corregido (B8):** el `upsert` de Prisma no es atomico frente a inserciones
  concurrentes; el lock de conversacion fallaba con P2002 en vez de perderse limpiamente. Lo
  encontro la prueba de concurrencia.
- Corregida una prueba propia mal escrita: decia "nace en borrador" pero verificaba el estado
  despues de que el helper publicaba, asi que no probaba nada.
- Pruebas: **70/70**. Fases 3, 2 y 1 sin regresiones. Build, lint y tsc limpios.
- **Fase 4 cerrada contra el proveedor guionado. Falta validarla contra OpenAI (T12).**

### 2026-09-08 — Fase 5, infoproductos, Mercado Pago y entrega digital

- 9 tablas y 8 enums nuevos; migracion `20260908120000_fase5_comercio_entrega`, aditiva.
- Bifurcado el webhook de Mercado Pago por `metadata.kind`: cierra el riesgo anotado en la Fase 0.
  Probado que comprar un producto deja la suscripcion intacta.
- Catalogo, pedidos con snapshot de precio, checkout, recovery a 1/24/72 h y entrega digital
  idempotente con token hasheado.
- 6 herramientas de comercio para el agente. `create_checkout` queda fuera del default y
  `create_digital_delivery` no se implementa.
- Paginas `/productos` y `/pedidos`, y pagina publica `/d/[token]`.
- Pruebas: **70/70**. Fases 4, 3, 2 y 1 sin regresiones. Build, lint y tsc limpios.
- La suite de la Fase 4 necesito un ajuste porque el agente por defecto gano herramientas: la
  prueba de "herramienta no autorizada" ahora usa `create_checkout`.
- **Pendiente para que el criterio de salida se cumpla de verdad:** el acceso se genera pero
  **no se envia solo** al cliente (D29/T14), y falta la vuelta contra Mercado Pago real (T4).
- **Fase 5 cerrada.**

### 2026-09-08 — Fase 6, Shopify

- Sin modelos nuevos: solo constraints de unicidad para sincronizar sin duplicar, `SHOPIFY` en
  `IntegrationProvider` y dos tipos de trabajo. Tres migraciones aditivas.
- OAuth completo con state firmado + nonce en cookie, HMAC de callback y validacion de dominio.
- Cliente GraphQL, sincronizacion de catalogo, consulta viva, draft orders y 5 webhooks.
- `create_checkout` y `check_inventory` del agente bifurcan por proveedor.
- **Hallazgo corregido (B9):** un `as never` usado para que compilara un valor de enum inexistente
  habria fallado en produccion. Se agrego el valor al enum de verdad.
- Pruebas: **74/74** con fixtures. Fases 5, 4, 3, 2 y 1 sin regresiones. Build, lint y tsc limpios.
- **Fase 6 cerrada a nivel de codigo. Falta validarla contra una tienda real (T16).**

### 2026-09-08 — Fase 7, cotizador y aprobaciones

- 4 tablas y 4 enums nuevos; migracion `20260908180000_fase7_cotizador`, aditiva.
- Lenguaje de reglas en JSON con 6 tipos de componente, minimo y redondeo. Las condiciones
  reutilizan el evaluador de la Fase 3.
- Motor de calculo determinista y puro; validacion de intake que dice que campos faltan.
- Ciclo completo: crear, revision obligatoria, aprobar (solo owner/admin), enviar, aceptar y
  versionar. Una aprobada no se edita.
- PDF sin dependencias, verificado abriendolo en el navegador. Se corrigieron dos caracteres que
  salian como `?` por no estar mapeados a WinAnsi.
- 4 herramientas de cotizacion para el agente. Con esto quedan implementadas 20 de las 21 de la
  spec; la restante se omite a proposito.
- **Hallazgo corregido (B10):** el enlace del PDF se perdia al aprobar la ultima cotizacion, y no
  habia forma de recuperarlo. Lo detecto la prueba manual en la interfaz, no la suite.
- Pruebas: **79/79**. Fases 6, 5, 4, 3, 2 y 1 sin regresiones. Build, lint y tsc limpios.
- **Fase 7 cerrada.**

### 2026-09-11 — Fase 8, recuperacion, email y campanas

- 12 tablas y 13 enums nuevos; migracion `20260910120000_fase8_recuperacion_email`, aditiva, con
  backfill de la politica de contacto y de las dos reglas de scoring de email para los workspaces
  que ya existian.
- Politica de contacto con quiet hours **en la zona del workspace**, topes por canal y la regla de
  no mezclar WhatsApp y email promocional el mismo dia.
- Los 8 segmentos de la spec, escritos con el mismo lenguaje que uno propio del cliente. La
  exclusion de suprimidos vive en el resolvedor.
- Los 4 journeys de la spec con sus tiempos, en borrador. Motor que avanza de a un paso, persiste
  el proximo y sale cuando el contacto responde, compra o lo toma un humano.
- Interfaz `EmailProvider` con dos adaptadores: Resend (firma Svix verificada) y uno guionado que
  sirve tanto para las pruebas como para un workspace sin email configurado.
- Campanas por tandas con destinatarios materializados y el motivo de cada omision.
- Baja publica en `/baja/[token]`: no se ejecuta al abrir la pagina, solo al confirmar.
- Personalizacion con IA acotada a huecos declarados por el template.
- **Dos hallazgos corregidos:** el alta de un cliente excedia el limite de la transaccion (B11) y
  el token de baja quedaba en claro en el cuerpo guardado (B12). El primero habria roto el registro
  de clientes reales; lo detecto la suite al crear sus propios workspaces.
- Pruebas: **142/142**. Fases 7 a 1 sin regresiones. Build, lint (0 errores) y tsc limpios.
- **Fase 8 cerrada. No se inicia la Fase 9 sin aprobacion del propietario.**

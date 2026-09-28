# P0-B — Subscription Core V2: auditoría y diff propuesto

Estado: **propuesta, sin migrar.** Rama `feat/p0b-subscription-core-v2` (desde `98507eb`). Fecha: 2026-09-26.

Me detuve antes de migrar por dos decisiones estructurales que no estaban contempladas (§7). Todo lo demás está listo para implementar tal cual.

---

## 1. Auditoría del billing actual

**Modelos**
- `SubscriptionPlan`: `key` libre (`monthly`, `beta-inicial`, `beta-comercial`, `beta-completo`), `priceClp`, `maxUsers`, `maxContacts`, `capabilities[]`, `allowances` (JSON) y `overages`. El precio vive en el plan, solo en CLP y con un único intervalo implícito (mes).
- `WorkspaceSubscription`: `planId`, `status` (`TRIAL | ACTIVE | PAST_DUE | CANCELED`), `trialEndsAt`, `renewsAt`, `mpPreferenceId`, `mpPaymentId @unique`. No lleva medio de pago, periodo ni suspensión. El código trata "la más reciente" como vigente, pero nada impide tener varias filas.
- No hay un libro de pagos SaaS: el webhook sobrescribe `mpPaymentId` en la misma fila y el historial se pierde.

**Datos**
- `crm_pruebas`: 6 suscripciones, todas `TRIAL` sobre `monthly`, ninguna duplicada por workspace.
- Producción, según el pre-flight: 3 workspaces en `TRIAL`; `upzites` venció el 21-09. En prod nunca se cobró nada, porque el token de Mercado Pago no está cargado.

**Quién interpreta el estado**
- `billing/subscription-state.ts` (P0-A) es el resolver único. Lo usan la UI (layout, billing), `getEntitlements`, `canWorkspaceConsume` (agente, outbox, canal, email) y el onboarding.
- Semántica actual: `EXPIRED` significa bloqueo total (pantalla de vencido) y cero consumo.

**Quién escribe suscripciones**
- `createCustomerWorkspace`: el alta crea una `TRIAL` de 7 días sobre `monthly`.
- El webhook SaaS pone `ACTIVE` y `renewsAt` a 30 días, y toma el plan de `metadata.planKey`.
- Seeds y smokes (`seed.ts`, `seed-alvaro.ts`, `smoke-beta`, `smoke-fase9`, `smoke-p0a`).

**Enforcement actual (capacidades y cupos)**
- 6 puntos con `hasCapability` / `checkAllowance`: contactos, Shopify, email, campañas, cotizador y presupuesto de IA.
- **Los dos exigen `entitlements.active`**, que hoy significa "vigente y pagado". Una métrica no declarada queda prohibida.

**Checkout SaaS**
- Recibe un `planKey` libre y cobra `plan.priceClp` en CLP fijo.
- Metadata `{ kind: 'saas_subscription', planKey, workspaceId }` (FOUNDATION).
- El webhook valida el monto contra `plan.priceClp`.

**UI**
- `/billing` muestra `plan.priceClp`, `maxUsers` y `maxContacts` de la fila del plan.
- `/api/plans` siembra los `beta-*` bajo demanda.

## 2. Diff de schema propuesto (aditivo)

```prisma
enum PlanCode { FREE START PRO SCALE }
enum BillingSource { FREE MANUAL MERCADO_PAGO COMP TRIAL }
enum BillingInterval { MONTH YEAR }

model SubscriptionPlan {
  // existentes intactos (key, priceClp, capabilities, allowances, ...)
  /// Codigo comercial formal. null = plan legacy (monthly, beta-*): sigue
  /// funcionando para suscripciones antiguas, pero ya no se vende.
  code PlanCode? @unique
}

/// Price Book: precio por plan, moneda e intervalo, con vigencia. La DB es la
/// fuente de verdad (un SUPER_ADMIN podra cambiarlo en P0-D sin deploy).
model PlanPrice {
  id          String          @id @default(cuid())
  planCode    PlanCode        @map("plan_code")
  currency    String          // ISO 4217: CLP, USD
  interval    BillingInterval @default(MONTH)
  /// Unidades menores ISO 4217. CLP (exponente 0): 19990. USD (exponente 2): 1900.
  amountMinor Int             @map("amount_minor")
  active      Boolean         @default(true)
  validFrom   DateTime        @default(now()) @map("valid_from")
  validUntil  DateTime?       @map("valid_until")
  createdById String?         @map("created_by_id")
  createdAt   DateTime        @default(now()) @map("created_at")

  @@index([planCode, currency, interval, active])
  @@map("plan_prices")
}

model WorkspaceSubscription {
  // existentes intactos: planId, status (legacy), trialEndsAt, renewsAt,
  // mpPreferenceId, mpPaymentId
  billingSource      BillingSource @default(FREE) @map("billing_source")
  currentPeriodStart DateTime?     @map("current_period_start")
  /// null = sin vencimiento (FREE; COMP indefinido)
  currentPeriodEnd   DateTime?     @map("current_period_end")
  suspendedAt        DateTime?     @map("suspended_at")
  suspendedReason    String?       @map("suspended_reason")
  /// Precio acordado (snapshot) y de que fila del Price Book salio.
  priceId            String?       @map("price_id")
  currency           String?
  amountMinor        Int?          @map("amount_minor")
  notes              String?
  updatedById        String?       @map("updated_by_id")

  payments SubscriptionPayment[]
  @@unique([workspaceId]) // una suscripcion vigente por workspace; historial en pagos + AuditLog
}

/// Libro de pagos SaaS (MANUAL y MERCADO_PAGO). Separado a proposito de
/// Payment/CustomerOrder, que son el commerce de cada workspace.
model SubscriptionPayment {
  id                String        @id @default(cuid())
  workspaceId       String        @map("workspace_id")
  subscriptionId    String        @map("subscription_id")
  planCode          PlanCode      @map("plan_code")
  source            BillingSource
  currency          String
  amountMinor       Int           @map("amount_minor")
  paidAt            DateTime      @map("paid_at")
  periodStart       DateTime      @map("period_start")
  periodEnd         DateTime      @map("period_end")
  reference         String?
  notes             String?
  /// Idempotencia de Mercado Pago.
  externalPaymentId String?       @unique @map("external_payment_id")
  priceId           String?       @map("price_id")
  recordedById      String?       @map("recorded_by_id")
  createdAt         DateTime      @default(now()) @map("created_at")

  @@index([workspaceId, paidAt])
  @@map("subscription_payments")
}
```

**Migración `…_subscription_core_v2`** (una sola; no requiere `ALTER TYPE … ADD VALUE`):
1. Crea enums, tablas y columnas nullable o con default.
2. Price Book inicial: 8 filas activas (4 planes × CLP/USD, `MONTH`) con `validFrom = now()`.
3. Backfill idempotente de filas legacy:
   - `billingSource`: `mpPaymentId` → `MERCADO_PAGO`; `TRIAL` → `TRIAL`; el resto → `MANUAL`.
   - `currentPeriodEnd = COALESCE(renewsAt, trialEndsAt)`.
   - `currentPeriodStart = createdAt`.
4. Si existe un pago MP previo, crea su `SubscriptionPayment`, para no perder el historial.
5. `@@unique([workspaceId])` al final. Si hubiera duplicados, la migración falla sin cambiar nada: el pre-flight y `crm_pruebas` dan 0.

Queda intacto: `status`, `trialEndsAt`, `renewsAt`, `mpPreferenceId`, `mpPaymentId`, `priceClp`, `maxUsers` y `maxContacts`. Las filas de plan `monthly` y `beta-*` quedan con `code = null` e `isActive = false` para vender, pero las suscripciones que apuntan a ellas siguen resolviéndose con sus propios términos.

Los planes FREE, START, PRO y SCALE (filas de `SubscriptionPlan` con `code`) se crean con `ensurePlanCatalog()`. Es idempotente y lee sus términos de un único archivo de configuración, igual que `ensureBetaPlans` hoy. Los precios **no** van ahí: van al Price Book.

## 3. Lifecycle: una sola máquina de estados

`resolveSubscription(workspaceId)` (con base de datos) delega en `resolveLifecycle(row, now)` (pura). **Reemplaza a `resolveSubscriptionState`**, no convive con él: los 6 consumidores actuales pasan a usarla.

| Condición (en orden) | `state` | `effectivePlan` | Acceso | Consumo pagado |
|---|---|---|---|---|
| `suspendedAt` presente | `SUSPENDED` | FREE | ver D2 | no |
| plan FREE | `FREE` | FREE | sí | ver D1 |
| `TRIAL`, `now < periodEnd` | `TRIAL` | configurado | sí | sí |
| `TRIAL` vencido | `EXPIRED` | FREE (sin gracia) | sí | ver D1 |
| `periodEnd = null` (COMP indefinido) o `now < periodEnd` | `ACTIVE` | configurado | sí | sí |
| MANUAL/MP, `now < periodEnd + 7d` | `GRACE` | **configurado** | sí + aviso | sí |
| pagado tras la gracia; COMP con fin vencido | `EXPIRED` | FREE | sí | ver D1 |
| sin fila | `FREE` | FREE | sí | ver D1 |

Contrato:

```ts
{ state, configuredPlan: PlanCode | null, legacyPlanKey: string | null, effectivePlan: PlanCode | 'LEGACY',
  billingSource, periodStart, periodEnd, graceEndsAt, renewsAt,
  price: { amountMinor, currency, interval } | null, hasAccess, canConsume, daysLeft }
```

`graceEndsAt` se deriva (`periodEnd + 7d`); no se guarda, para que haya una sola regla. Nada se borra al pasar a EXPIRED: solo cambia el plan efectivo. `getEntitlements` pasa a leer los términos del **plan efectivo** (el sistema actual de capacidades y cupos se conserva). Sin esto, una PRO vencida seguiría teniendo capacidades PRO.

## 4. Funciones server-side (`lib/billing/subscription-admin.ts`)

- `assignPlan(workspaceId, planCode, billingSource, opts)`
- `activateManualSubscription({ workspaceId, planCode, currency, amountMinor?, paidAt, periodStart, periodEnd, reference?, notes?, actorId })`: crea un `SubscriptionPayment`. Por defecto toma el importe del Price Book vigente.
- `renewManualSubscription(...)`: extiende desde `max(now, periodEnd)` y crea un `SubscriptionPayment`.
- `assignCompSubscription({ workspaceId, planCode, periodEnd?, reason, actorId })`
- `startTrial({ workspaceId, planCode, days, reason, actorId })`: sigue existiendo para campañas y promos.
- `suspendSubscription({ reason })` / `resumeSubscription()`

Todas escriben `AuditLog` (vía `recordAudit`, que ya etiqueta soporte) y `PlatformAuditLog` cuando hay un actor de plataforma. El webhook de Mercado Pago usa el mismo núcleo (`recordSaasPayment`) y crea un `SubscriptionPayment` con `externalPaymentId`.

**Registro nuevo:** FREE + `billingSource FREE`, sin periodo y sin trial. El paso "plan" del onboarding se reinterpreta: FREE cuenta como "tienes plan".

**Checkout SaaS:**
- Recibe `planCode` y `currency`.
- El precio se resuelve del Price Book y sale el `priceId`.
- Metadata `{ kind, workspaceId, planCode, priceId }`.
- El webhook valida el monto contra **esa** fila de precio, no contra un monto suelto. Nunca clasifica por monto.
- Se mantiene fail-closed.
- La metadata legacy `planKey` sigue aceptándose para preferencias en vuelo.

**Métricas SaaS** (`lib/platform/saas-metrics.ts`): clientes y MRR excluyen `isInternal` y `COMP`/`FREE`/`TRIAL`. El MRR se agrupa por moneda, sin conversión.

**Dry-run** (`scripts/subscription-migration.ts`):
- Modo lectura por defecto: lista workspaces con su suscripción actual y cómo quedaría.
- Recibe asignaciones explícitas por argumento o archivo (`--workspace upzites --internal --plan SCALE --source COMP`).
- Imprime las operaciones y solo escribe con `--apply`.
- No hay slugs en el código.

## 5. Price Book

Convención única: `amountMinor` en unidades menores ISO 4217. CLP tiene exponente 0 (`19990` = $19.990); USD tiene exponente 2 (`1900` = US$19). Un helper `formatMoney(amountMinor, currency)` usa la tabla de exponentes. No hay conversión entre monedas.

| Plan | CLP | USD |
|---|---|---|
| FREE | 0 | 0 |
| START | 19990 | 1900 |
| PRO | 49990 | 4900 |
| SCALE | 99990 | 9900 |

Vigente = `active && validFrom ≤ now && (validUntil null o > now)`; si hay varias, la de `validFrom` más reciente. Un cambio de precio es una fila nueva, nunca un update, así que el historial queda.

## 6. Auditoría de uso de IA (sin convertir a créditos)

- **Única llamada a modelos:** el runner del agente (`lib/agents/runner.ts`), vía la Responses API de OpenAI (`provider.ts`). Modelo por defecto: `OPENAI_DEFAULT_MODEL ?? 'gpt-5-mini'`. No hay embeddings ni otras llamadas a LLM.
- **`AgentRun`:** guarda `inputTokens`, `outputTokens`, `costEstimate` (CLP), `latencyMs`, `steps` y `toolCalls`. El **modelo no está en la corrida**: está en `AgentVersion.model` (se llega por `agentVersionId`). El proveedor no se guarda en la corrida.
- **`UsageRecord` / `UsageCounter`:** una fila `metric = 'ai_cost_clp'` por corrida, con `provider` (`openai` o `scripted`), `quantity = input + output` sumados (**se pierde la separación**) y `costEstimate` en CLP.
- **Costo estimado:** una tarifa plana `default` (200 CLP por millón de tokens de entrada, 1.600 de salida) para **todos** los modelos. No hay tabla por modelo ni por proveedor, así que el costo es aproximado.
- **Datos:** `crm_pruebas` tiene 0 registros de IA (los smokes limpian). La producción no se consultó.
- **Antes de fijar créditos convendría:**
  1. guardar el modelo y el proveedor en `AgentRun`;
  2. registrar input y output por separado en el uso;
  3. tener una tabla de tarifas por modelo.

## 7. Decisiones que necesito antes de migrar

**D1. Qué puede hacer FREE (y un plan vencido), antes de P0-C.** Hoy `hasCapability` y `checkAllowance` exigen "vigente y pagado" incluso para cupos de existencias. Con la regla nueva (registro → FREE, vencido → FREE efectivo), un FREE **ni siquiera podría crear contactos**. Hay que separar dos cosas: "usar el plan" (acceso y cupos del plan efectivo) y "gastar recursos pagados" (IA, mensajes, email). Además, FREE necesita números. Propuesta provisional, en un solo archivo y reemplazable en P0-C:
- **FREE:** sin capacidades pagadas (ni IA, ni WhatsApp, ni email, ni campañas, ni cotizador, ni Shopify), 1 usuario y 100 contactos, 0 en las métricas de consumo.
- **START / PRO / SCALE:** los términos actuales de `beta-inicial` / `beta-comercial` / `beta-completo`, respectivamente.

**D2. SUSPENDED en la UI.** Propongo que, hasta P0-C (que trae el solo lectura), SUSPENDED use la pantalla de bloqueo actual (con otro texto) y consumo cero. La otra opción es acceso de solo lectura, pero eso es un gate de P0-C.

**D3 (menor, tengo default).** COMP con fecha de fin vencida pasa a EXPIRED **sin** gracia; COMP sin fecha no vence. TRIAL vencido tampoco tiene gracia.

**D4 (a confirmar).** Mercado Pago Chile solo cobra CLP: el checkout MP ofrece solo precios CLP, y los precios USD quedan para MANUAL (transferencia, factura). No se convierte.

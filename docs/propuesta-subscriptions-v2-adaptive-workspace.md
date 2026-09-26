# Propuesta técnica — Subscriptions V2 + Adaptive Workspace

Estado: **propuesta para revisión. No hay código de esta fase implementado.**
Base auditada: `ddbe857` (producción) + `6623164` (fix SDK Mercado Pago), worktree `C:\dev\upzites-preview`.
Fecha: 2026-09-25.

---

## 1. Auditoría del estado actual

### 1.1 Modelos Prisma relevantes (`apps/crm/prisma/schema.prisma`, 33 migraciones)

| Modelo | Qué tiene hoy | Observaciones |
|---|---|---|
| `Workspace` | name, slug, publicKey | Sin estado propio; todo cuelga de relaciones. |
| `User` | **`workspaceId` obligatorio**, email, passwordHash (NOT NULL), role `OWNER/ADMIN/SALES` | Un usuario = un workspace. No hay memberships. `@@unique([workspaceId, email])`, pero el registro exige email **global** único. |
| `PasswordResetToken` | tokenHash único, expiresAt, usedAt | Patrón reutilizable para invitaciones de un solo uso. |
| `SubscriptionPlan` | key, `priceClp`, maxUsers, maxContacts, features[], **capabilities[]**, **allowances Json**, **overages Json**, isActive, position | Solo CLP. Ya separa "qué puede" de "cuánto puede". |
| `WorkspaceSubscription` | status `TRIAL/ACTIVE/PAST_DUE/CANCELED`, trialEndsAt, renewsAt, mpPreferenceId, mpPaymentId (único) | Sin billing source, sin periodo explícito, sin historial de pagos. `PAST_DUE` y `CANCELED` **nunca se asignan** en el código. |
| `UsageRecord` / `UsageCounter` | detalle auditable + contador `(workspace, periodo YYYY-MM, métrica)` | Buena base para límites de consumo mensual (IA). |
| `WorkspaceProfile` | businessType `UNDEFINED/INFOPRODUCT/ECOMMERCE/SERVICES`, industry, currency, country, horario, conocimiento para el agente | Ya existe: se **extiende**, no se crea. |
| `WorkspaceActivation` | `ONBOARDING/ACTIVE/SUSPENDED` | Controla si la IA atiende sola. Ya tiene `SUSPENDED`. |
| `WorkspaceAlert` | kind incluye `SUBSCRIPTION_EXPIRED`, `ALLOWANCE_NEAR_LIMIT/EXCEEDED` | Reutilizable para avisos de gracia/downgrade. |
| `FeatureFlag` | interruptores GLOBAL o por workspace | Son **kill switches operativos**, no entitlements. Se mantienen separados. |
| `AuditLog` | workspaceId obligatorio, actorId, action, metadata | Sirve para acciones de plataforma sobre un workspace (`platform.*`). |
| `ChannelAccount`, `WhatsAppChannel` | cuentas de canal conectadas | Base para contar `channels.max`. |
| `AutomationRule` (`isActive`), `AutomationFlow` (`status`) | dos sistemas de automatización | Ambos cuentan para `automations.active.max`. |

### 1.2 Auth
- Cookie de sesión firmada `{ userId, workspaceId, role, exp }` (`lib/auth.ts`). Login: `findFirst` por email.
- **No existen invitaciones ni gestión de equipo**: el único `user.create` es el del registro (`lib/subscription.ts`). El cupo `users` existe, pero no hay forma de agregar usuarios.
- **No existe Platform Admin.** `/ops` está limitado al workspace para cualquier rol, pero muestra la cola de jobs global y los `DEAD` jobs con su `lastError` a cualquier usuario de cualquier workspace (posible fuga de datos entre tenants).

### 1.3 Suscripciones y billing
- **Registro:** plan `monthly` (49.000 CLP, **todas** las capacidades), `TRIAL` de 7 días. El alta también crea etapas, formulario, 4 automatizaciones **activas**, agente en borrador, integraciones y marketing.
- **Conviven tres catálogos:** `monthly` (`ensureMonthlyPlan`, usado por el registro y el checkout), `BETA_PLANS` (`beta-inicial/comercial/completo`, sembrados al vuelo desde `GET /api/plans`) y el que fije cada fila de la DB.
- **Vencimiento = bloqueo total:** `app/(dashboard)/layout.tsx` muestra `SubscriptionExpired` y bloquea toda la app. No hay gracia ni downgrade.
- **Dos definiciones de "activo" (bug):**
  - `getSubscriptionStatus`, usado por la UI, revisa `renewsAt`/`trialEndsAt`.
  - `getEntitlements`, usado por los límites, considera `ACTIVE` activo **para siempre**.

  Un `ACTIVE` vencido tiene la UI bloqueada, pero los procesos en segundo plano (agente, email, campañas) siguen consumiendo.
- **Webhook MP:** actualiza en el lugar la última fila de suscripción (`renewsAt = now + 30d`). No guarda el pago de suscripción como registro: `Payment` es de pedidos de clientes finales.
- **Sin pagos manuales**, sin moneda distinta de CLP y sin fecha de pago separada de la de vencimiento.

### 1.4 Entitlements actuales (`lib/billing/plans.ts`, `lib/billing/usage.ts`)
- Capacidades cerradas: `WHATSAPP, AI_AGENTS, QUOTES, SHOPIFY, PAYMENTS, EMAIL, CAMPAIGNS`.
- Métricas con tipo `stock` o `flow`, overages, y la regla "nunca ilimitado; métrica no declarada = prohibida".
- **Se aplica en 6 puntos:** alta de contacto, conexión Shopify, runner del agente (costo IA), envío de email, campañas y cotizaciones.
- **No se aplica en:** usuarios (no hay alta), números de WhatsApp, cuentas Meta (`ChannelAccount`), automatizaciones activas, navegación y UI.
- El frontend **no consulta** capacidades: el sidebar muestra todo a todos.

Diagnóstico: la filosofía correcta ya existe (preguntar por capacidad, nunca por nombre de plan). Falta un catálogo más rico, un resolver único y cobertura completa.

### 1.5 Sidebar / navegación
- `components/layout/sidebar.tsx`: 20 ítems en un array estático.
- Dos secciones cortadas por índice (`slice(0, 14)`), ancho fijo `w-[248px]`.
- Sin colapso en escritorio y sin filtro por rol, plan o tipo de negocio. Sin preferencias persistidas.

### 1.6 Dashboard
- `getDashboardData()` es una sola consulta monolítica: 4 `StatCard` fijos más listas de actividades, oportunidades y fuentes.
- No hay registro de widgets ni layout por usuario.

### 1.7 Onboarding
- `lib/onboarding/*` calcula el avance a partir del **estado real** (hay canal conectado, hay agente publicado); no guarda casillas. Es una buena decisión y se conserva.
- Las necesidades por paso son funciones centralizadas por `businessType` y capacidades (`paymentsNeed`, `catalogNeed`…).
- Wizard en `/onboarding` y activación en `/api/onboarding/activate`.

### 1.8 Preferencias
- Solo `localStorage` con prefijo `crm:` (borradores del inbox), que se limpia en el logout. No hay preferencias por usuario en el servidor.

---

## 2. Qué se reutiliza

| Pieza | Uso en V2 |
|---|---|
| `SubscriptionPlan` + filosofía capabilities/allowances | Base del catálogo de planes. Se extiende con claves nuevas; no se reemplaza. |
| `UsageCounter` / `UsageRecord` / `recordUsage` | Créditos de IA mensuales y consumo por periodo. |
| `checkAllowance` / `hasCapability` | Se mantienen como **fachada** que delega al nuevo resolver, así los 6 puntos actuales no se tocan en P0. |
| `WorkspaceProfile` | Se extiende (objetivo, equipo, canales, preset). |
| `lib/onboarding/requirements.ts` (estado derivado) | Motor del checklist persistente. |
| `PasswordResetToken` (hash + un solo uso) | Mismo patrón para `Invitation`. |
| `AuditLog` | Acciones de plataforma con prefijo `platform.*` sobre el workspace afectado. |
| `WorkspaceAlert` | Avisos de gracia, vencimiento y límite. |
| `Job` (cola existente) | Job diario de ciclo de vida de suscripciones. |
| `FeatureFlag` | Kill switches. Efectivo = entitlement **y** flag encendido. |

## 3. Qué debe migrarse

1. **Registro:** `monthly + TRIAL 7d` pasa a **FREE + billingSource FREE + ACTIVE sin vencimiento**.
2. **Vencimiento:** el bloqueo total pasa a **gracia → downgrade a FREE**, sin borrar datos. El bloqueo total queda solo para `SUSPENDED` (decisión administrativa).
3. **Definición de "activo":** una sola función (resolver). Se elimina la divergencia UI/backend.
4. **Catálogos:** `monthly` y `BETA_PLANS` pasan a FREE/START/PRO/SCALE. Los planes viejos quedan `isActive=false` y las suscripciones existentes se mapean (decisión pendiente, §9).
5. **Webhook MP:** además de activar, registra un `BillingPayment`, fija `billingSource=MERCADO_PAGO` y el periodo.
6. **Automatizaciones de fábrica:** el alta no puede dejar 4 activas si FREE permite 1. El preset decide cuál queda activa; el resto se crea en pausa.
7. **Sidebar y dashboard:** de arrays y consultas fijas a registros (navegación y widgets).
8. **`/ops`:** la vista global (cola y DEAD jobs) pasa a Platform Admin. `/ops` del cliente queda solo con lo suyo.

## 4. Nuevos modelos y campos

```prisma
enum BillingSource { FREE MANUAL MERCADO_PAGO COMP TRIAL }

// SubscriptionStatus: se AGREGAN valores (Postgres no permite quitar):
//   TRIAL (existente, = en prueba), ACTIVE, PAST_DUE (= periodo de gracia),
//   CANCELED, + SUSPENDED, + EXPIRED (histórico tras downgrade)

model WorkspaceSubscription {           // se extiende, 1 fila vigente por workspace
  // existentes: planId, status, trialEndsAt, renewsAt, mpPreferenceId, mpPaymentId
  billingSource      BillingSource @default(FREE)
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?      // null = sin vencimiento (FREE)
  graceEndsAt        DateTime?
  suspendedAt        DateTime?
  suspendedReason    String?
  currency           String?        // precio acordado (manual/comp)
  amountMinor        Int?
  notes              String?
  updatedById        String?
  // + @@unique([workspaceId]) tras verificar que no hay duplicados
}

model PlanPrice {                       // precio por moneda
  id String @id; planId String; currency String; interval String @default("MONTH")
  amountMinor Int; isActive Boolean @default(true)
  @@unique([planId, currency, interval])
}

model BillingPayment {                  // historial de pagos de suscripción
  id String @id; workspaceId String; subscriptionId String
  source BillingSource; currency String; amountMinor Int
  paidAt DateTime; periodStart DateTime; periodEnd DateTime
  reference String?; notes String?
  externalPaymentId String? @unique     // idempotencia MP
  recordedById String?; createdAt DateTime
}

model WorkspaceEntitlementOverride {    // acuerdos especiales (P2 en UI, P0 en resolver)
  id String @id; workspaceId String; key String; value Json
  reason String?; expiresAt DateTime?; createdById String
  @@unique([workspaceId, key])
}

model PlatformAdmin {                   // separado de UserRole (que es del workspace)
  id String @id; userId String @unique; grantedById String?; createdAt DateTime
}

model Invitation {
  id String @id; workspaceId String; email String; role UserRole
  tokenHash String @unique; expiresAt DateTime
  acceptedAt DateTime?; revokedAt DateTime?
  invitedById String?; createdAt DateTime
  @@index([workspaceId]); @@index([email])
}

model WorkspaceProfile {                // se extiende
  // BusinessType: + APPOINTMENTS, + GENERAL (INFOPRODUCT se conserva, ver §9)
  primaryGoal       PrimaryGoal?
  teamSize          TeamSize?
  preferredChannels Channel[] @default([])
  presetKey         String?
  presetVersion     Int?
  presetAppliedAt   DateTime?
}

model UserPreference {                  // por (usuario, workspace): listo para memberships
  id String @id; userId String; workspaceId String
  sidebarWidth Int?; sidebarCollapsed Boolean @default(false)
  navOrder String[] @default([]); hiddenNavItems String[] @default([])
  dashboardLayout Json?; dismissedTutorials String[] @default([])
  @@unique([userId, workspaceId])
}
```

Notas:
- **La invitación crea el `User` al aceptarse**, no antes. Así no hay usuarios sin contraseña y `passwordHash` sigue siendo NOT NULL. Un workspace creado por el admin existe sin usuarios hasta que el owner acepta.
- **Memberships (un usuario en varios workspaces) NO entra en esta fase.** Limitación documentada: no se puede invitar un email que ya existe en otro workspace.
- **El checklist no guarda casillas.** Se deriva del estado real (igual que hoy). Solo se persisten los descartes (`dismissedTutorials`).

## 5. Estrategia de migraciones

Patrón **expand → backfill → switch → contract**:

1. **M1 (expand, solo aditiva):** tablas nuevas, columnas nullable y valores de enum nuevos. `ALTER TYPE … ADD VALUE` va en su **propia migración**, porque en Postgres no se puede usar el valor nuevo en la misma transacción. No rompe el código desplegado.
2. **Backfill (script `tsx` idempotente, con `--dry-run`):**
   - crear FREE/START/PRO/SCALE + `PlanPrice`;
   - `currentPeriodEnd = renewsAt ?? trialEndsAt`;
   - `billingSource`: `mpPaymentId` → `MERCADO_PAGO`, `TRIAL` → `TRIAL`, el resto según la decisión de §9;
   - reportar duplicados de suscripción por workspace antes del `@@unique`.
3. **M2:** `@@unique([workspaceId])` en la suscripción, tras el backfill.
4. **Switch de código:** resolver, enforcement y ciclo de vida. Se despliega con los datos ya migrados.
5. **M3 (contract, P2):** retirar `priceClp`, `maxUsers`, `maxContacts` y `mpPreferenceId` cuando nada los lea.

Siempre `prisma migrate deploy` en producción, nunca `migrate dev`. Todo se ensaya primero en `crm_pruebas`.
**Antes de cualquier migración en producción** hay que verificar `_prisma_migrations`. En la raíz del repo principal existe `pending-production-migrations.zip` con 6 migraciones del 15–16 de septiembre, lo que sugiere que producción puede estar atrasada. No se tocó producción en esta auditoría.

## 6. Arquitectura de entitlements

```
lib/entitlements/
  catalog.ts        claves + tipo + unidad + etiqueta + cómo se mide
  plans.config.ts   valores FREE/START/PRO/SCALE (única fuente de números)
  resolve.ts        resolveEntitlements(workspaceId) -> EntitlementSnapshot
  enforce.ts        can(), assertModule(), assertWithinLimit()
  react.tsx         <EntitlementsProvider>, useEntitlements(), <Gate>
```

**Catálogo (clave → tipo):**
- **Límites de existencias** (se cuentan en vivo): `users.max`, `contacts.max`, `channels.max`, `automations.active.max`.
- **Créditos de consumo del mes** (`UsageCounter`): `ai.monthlyCredits`. Opcionales: `emails.monthly`, `campaigns.contacts.monthly`.
- **Módulos** (booleanos): `modules.orders`, `.recovery`, `.quotes`, `.analytics`, `.ai`, `.integrations`, `.api`, `.campaigns`.

**Resolución** (función pura, testeable):
`efectivo = plan.config ⊕ PlanOverride(DB) ⊕ WorkspaceEntitlementOverride ⊕ política de estado`

| Estado | Efecto |
|---|---|
| `ACTIVE` / `TRIAL` vigente | valores del plan |
| `PAST_DUE` (gracia) | valores del plan + banner |
| vencido tras gracia | **valores de FREE** (downgrade automático, datos intactos) |
| `SUSPENDED` | solo lectura en toda la app |

Snapshot serializable: `{ planKey, status, billingSource, periodEnd, graceEndsAt, readOnly, limits, modules }`.
- **Backend:** toda ruta de escritura y todo worker (agente, journeys, campañas, automatizaciones) pasa por `enforce.ts`.
- **Frontend:** el layout resuelve el snapshot una vez y lo pasa al `EntitlementsProvider`. La navegación y los widgets declaran `requires: 'modules.quotes'`. **Mismas claves en ambos lados.** Ningún componente pregunta por el nombre del plan.
- **Transición:** `hasCapability('QUOTES')` y `checkAllowance('contacts')` se mapean a las claves nuevas, así los 6 puntos actuales siguen funcionando.
- **Regla "nunca ilimitado":** se mantiene. SCALE tiene números altos, no infinito.

Mapeo desde el sistema actual: `WHATSAPP`→`channels.max`, `AI_AGENTS`→`modules.ai`, `QUOTES`→`modules.quotes`, `PAYMENTS`→`modules.orders`, `EMAIL`/`CAMPAIGNS`→`modules.campaigns`, `SHOPIFY`→`modules.integrations`, `ai_cost_clp`→`ai.monthlyCredits`.

## 7. Arquitectura de presets

```
lib/navigation/items.ts      registro: { key, href, label, icon, section, requires?, roles? }
lib/dashboard/widgets.ts     registro: { key, title, sizes, defaultSize, requires?, load(ctx), Component }
lib/workspace-presets/       { key, version, businessType,
                               nav: { order, hidden }, priorityModules,
                               widgets: [{ key, size }], checklist: ChecklistKey[], tutorials }
lib/onboarding/checklist.ts  { key, label, href, isDone(ctx) }   // derivado del estado real
```

- **Composición pura:** `buildNavigation(registry, preset, userPrefs, entitlements, role)` y `buildDashboard(...)`, con tests. El sidebar y el dashboard solo renderizan el resultado. **Cero `if (businessType)` en componentes.**
- **El preset se resuelve al leer, no se copia al aplicar:** el perfil guarda `presetKey` y `presetVersion`, y las preferencias del usuario solo guardan **desviaciones**. Así, mejorar un preset beneficia a quien no personalizó.
- **Sidebar:** 260 px por defecto, redimensionable entre 220 y 340 px, colapsado a 72 px. Se persiste en `UserPreference`; el layout lo lee en el servidor y lo aplica como variable CSS, sin parpadeo. En móvil sigue siendo drawer.
- **Dashboard:** cada widget carga sus propios datos en paralelo (Suspense) y reemplaza a `getDashboardData`. El usuario reordena, oculta, muestra y redimensiona sobre `dashboardLayout`.
- **Onboarding:** 4 pasos (tipo de negocio → objetivo → canales → equipo) → se aplica el preset → checklist persistente (negocio, WhatsApp, Instagram, contactos, primera automatización, equipo). Los tutoriales son contextuales por pantalla y se pueden descartar.

## 8. Riesgos

1. **Pasar de "vencido = bloqueado" a "vencido = FREE" regala producto** si FREE no se aplica en todas las rutas de escritura y workers. Orden obligatorio: enforcement completo **antes** de cambiar el comportamiento del vencimiento.
2. **El bug de las dos definiciones de "activo"** ya permite consumo en segundo plano con suscripción vencida. Se corrige en P0.1.
3. **Clientes reales por encima de los límites de FREE** tras migrar (Alvaro). El mapeo no debe degradar a nadie: se asigna MANUAL/COMP con fecha explícita.
4. **Moneda:** MP Chile cobra en CLP. Precios en USD implican una tabla CLP propia o una conversión; hay que decidir la política.
5. **Unidad de créditos de IA:** hoy es costo en CLP. Hay que definir qué es un crédito.
6. **Enums de Postgres:** los valores no se pueden quitar, así que se agregan con cuidado y en migración propia.
7. **Un usuario = un workspace:** no se puede invitar un email que ya existe. Queda documentado; memberships en P2.
8. **Trabajo Meta sin commitear** en el checkout principal (`release-hardening`: canales Instagram/Messenger, `lifecycle.ts`). `channels.max` depende de `ChannelAccount`, así que conviene integrar ese trabajo antes de empezar para evitar conflictos.
9. **Producción posiblemente atrasada en migraciones y sin credenciales MP.** El E2E de MP sigue pendiente (`docs/qa-mercado-pago-webhook-2026-09-25.md`).
10. **`/ops` expone jobs globales** a cualquier usuario. Se corrige al mover la vista global a Platform Admin.
11. **Downgrade con exceso de uso:** política para automatizaciones activas y canales conectados por encima del límite (ver §9).

## 9. Decisiones que necesito de ti

1. **Mapeo de suscripciones existentes:** `monthly` (49.000 CLP) y `beta-*` → ¿PRO? ¿Alvaro como MANUAL o COMP, con qué vencimiento?
2. **`INFOPRODUCT`:** recomiendo conservarlo como variante de ECOMMERCE (el onboarding de pagos digitales depende de él) y ofrecer en UI SERVICES / ECOMMERCE / APPOINTMENTS / GENERAL.
3. **Crédito de IA** = ¿1 inferencia? ¿N tokens? ¿X CLP de costo?
4. **Días de gracia** (propuesta: 7).
5. **Exceso tras downgrade:** propuesta: pausar las automatizaciones sobrantes marcándolas `pausedByPlan` (reversible al subir de plan), dejar los canales conectados pero sin permitir conectar más, y bloquear la creación de contactos sin borrar ninguno.
6. **Precios:** ¿tabla CLP propia por plan (recomendado para MP) o conversión desde USD?
7. **Rama base:** ¿integro primero el trabajo Meta sin commitear de `release-hardening`?

## 10. Plan

### P0 — Cimientos (sin cambios visibles salvo registro y vencimiento)
1. **Entitlements core:** catálogo, `plans.config` FREE/START/PRO/SCALE, resolver único, fachada para `hasCapability`/`checkAllowance`, tests del resolver.
2. **Migración M1 + backfill** con dry-run, ensayada en `crm_pruebas`; M2 (`unique` por workspace).
3. **Enforcement completo:** contactos, usuarios, canales (WhatsApp y Meta), automatizaciones activas (reglas y flows), módulos en API y workers.
4. **Ciclo de vida:** job diario ACTIVE → PAST_DUE (gracia) → FREE; el bloqueo total queda solo para SUSPENDED; banners con `WorkspaceAlert`.
5. **Registro en FREE;** automatizaciones de fábrica que respetan el límite.
6. **Webhook y checkout MP** sobre `BillingPayment` y `PlanPrice` (CLP), con los tests del fix intactos.

### P1 — Operación y experiencia
1. **Platform Admin** (`/admin`): listar workspaces, crear workspace + invitación de owner (enlace copiable), plan, billing source, pago manual (moneda, monto, referencia, fechas), extender, cambiar plan, suspender/reactivar; todo auditado. Mueve la vista global de `/ops`.
2. **Invitaciones de equipo** dentro de `users.max`.
3. **Registro de navegación** + sidebar redimensionable/colapsable + `UserPreference`.
4. **`WorkspaceProfile` extendido** + registro de presets + wizard de 4 pasos.
5. **`EntitlementsProvider`/`Gate`**, avisos de upgrade y página de billing con los 4 planes.

### P2 — Personalización y limpieza
1. Registro de widgets + dashboard personalizable.
2. Tutoriales contextuales y checklist persistente completo.
3. Precios multi-moneda en UI/checkout; evaluar preapproval (cobro recurrente) de MP.
4. UI de overrides por workspace, módulo API y memberships multi-workspace.
5. Migración contract (retirar columnas legacy).

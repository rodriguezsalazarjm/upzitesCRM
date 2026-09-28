# P0-C — Entitlements: auditoría y propuesta

Estado: **implementado** (D1-D6 aprobados 2026-09-28). Rama `feat/p0c-entitlements` (desde `51b101f`). Las secciones 1-4 son la auditoria y propuesta originales; la arquitectura final esta en la seccion 5.
Base aprobada: `propuesta-subscriptions-v2-adaptive-workspace.md` §6 y el contrato de P0-B (`resolveSubscription`).

---

## 1. Auditoría: qué se controla hoy

**Sistema actual** (`billing/plans.ts` + `billing/usage.ts`, adaptado en P0-B para leer el plan **efectivo**):
- 7 capacidades booleanas: `WHATSAPP`, `AI_AGENTS`, `QUOTES`, `SHOPIFY`, `PAYMENTS`, `EMAIL`, `CAMPAIGNS`.
- 7 cupos: existencias (`contacts`, `users`, `whatsapp_numbers`) y consumo del mes (`conversations`, `ai_cost_clp`, `emails`, `campaign_contacts`).
- Regla vigente: una métrica no declarada queda prohibida y nada es ilimitado.

**Dónde se aplica (14 puntos):**

| Punto | Gate |
|---|---|
| Crear contacto (`api/contacts`) | `contacts` |
| Conectar Shopify | `SHOPIFY` |
| Agente IA (`agents/runner`) | consumo pagado + `ai_cost_clp` |
| Envío por canal (`channels/outbound`) y outbox de WhatsApp | consumo pagado |
| Email (`email/send`) | consumo pagado + `EMAIL` + `emails` |
| Campañas | `CAMPAIGNS` + `campaign_contacts` |
| Cotizador | `QUOTES` |
| Alertas y página de uso | lectura |

**Huecos: acciones sin gate de plan (solo gate de rol):**

| Acción | Endpoint | Qué falta |
|---|---|---|
| Conectar WhatsApp | `integrations/whatsapp/connect` | `WHATSAPP` y `whatsapp_numbers` **no se verifican** |
| Conectar Instagram/Messenger | `integrations/channels/[channel]/connect` | no hay capacidad ni cupo de canales |
| Conectar Mercado Pago (OAuth) y crear checkout de pedido | `mercado-pago/*`, `orders/[id]/checkout` | `PAYMENTS` existe pero **no se aplica** |
| Crear productos | `api/products` | sin gate (depende de `PAYMENTS`) |
| Publicar flujo de automatización | `automation-flows/[id]` (publish) | sin límite de flujos activos |
| Publicar journey | `journeys/[id]/publish` | sin gate (el envío sí lo tiene, pero publicar no) |
| Publicar agente | `agents/[id]/publish` | solo rol |
| Usuarios | (no hay invitaciones todavía, P0-D) | `users.max` se contaría al crear la membership |

**Frontend:** no hay gating. El sidebar muestra todos los módulos; solo el onboarding mira capacidades.

**Degradación:** no hay mecanismo reversible. `AutomationFlow` no tiene PAUSED (`DRAFT | PUBLISHED | ARCHIVED`) y los canales no tienen un estado "deshabilitado por plan".

## 2. Diseño (de V2 §6, concretado)

```
lib/entitlements/
  catalog.ts        claves + tipo (module | limit | credit) + etiqueta + cómo se mide
  plans.config.ts   valores FREE/START/PRO/SCALE (única fuente de números; reemplaza plan-catalog.terms)
  resolve.ts        resolveEntitlements(workspaceId) -> EntitlementSnapshot (puro + loader)
  enforce.ts        can(), assertModule(), assertWithinLimit(), assertCredit()
  downgrade.ts      applyPlanLimits(workspaceId) / releasePlanLimits(workspaceId)
  react.tsx         <EntitlementsProvider>, useEntitlements(), <Gate requires="...">
```

**Resolución:** `efectivo = plans.config[effectivePlan] ⊕ WorkspaceEntitlementOverride ⊕ política de estado`.
- `effectivePlan` sale de `resolveSubscription` (P0-B): FREE si expiró, el configurado en GRACE.
- SUSPENDED: todo bloqueado (hoy); ver D5.
- Snapshot serializable, que el layout resuelve una sola vez y pasa al provider: `{ planCode, state, billingSource, modules, limits: {key: {max, used}}, credits, overrides }`.

**Catálogo propuesto.** Mínimo: solo claves que controlan algo que ya existe.

| Clave | Tipo | Mide / controla | Mapeo actual |
|---|---|---|---|
| `modules.ai` | módulo | publicar y ejecutar agentes | `AI_AGENTS` |
| `modules.quotes` | módulo | cotizador | `QUOTES` |
| `modules.orders` | módulo | productos, checkout, conectar MP | `PAYMENTS` |
| `modules.campaigns` | módulo | journeys, campañas, email | `EMAIL` + `CAMPAIGNS` |
| `modules.integrations.shopify` | módulo | Shopify | `SHOPIFY` |
| `users.max` | límite (existencias) | memberships ACTIVE | `users` |
| `contacts.max` | límite | contactos | `contacts` |
| `channels.max` | límite | WhatsApp + Instagram + Messenger conectados, **agnóstico de proveedor** (decisión V2) | `whatsapp_numbers` + `WHATSAPP` |
| `automations.active.max` | límite | flujos PUBLISHED + reglas activas | (nuevo) |
| `ai.monthlyBudget` | crédito del mes | costo IA en CLP (hasta diseñar AI Credits) | `ai_cost_clp` |
| `messages.monthly` | crédito | conversaciones iniciadas | `conversations` |
| `emails.monthly` | crédito | emails | `emails` |
| `campaignContacts.monthly` | crédito | contactos de campaña | `campaign_contacts` |

Las funciones actuales (`hasCapability`, `checkAllowance`) se reescriben sobre `enforce.ts` con el mapeo de arriba, así los 14 puntos actuales no cambian de firma. Ningún código pregunta por el nombre del plan: todo usa claves.

**Gates nuevos (backend):** los 8 huecos de §1, cada uno con su clave. Toda escritura y todo worker pasan por `enforce.ts`.

**Frontend:** el sidebar y los widgets declaran `requires`. Un módulo no incluido se muestra bloqueado, con "Disponible en PRO", en vez de desaparecer, para que se entienda que existe. Son las mismas claves que en el backend.

**Degradación reversible** (decisión V2: nunca borrar). Schema aditivo: un marcador ortogonal al estado que decide el usuario, para que al subir de plan se restaure exactamente lo que había.

```prisma
// En AutomationFlow, AutomationRule, Journey, ChannelAccount, WhatsAppChannel:
planLimitedAt     DateTime? @map("plan_limited_at")
planLimitedReason String?   @map("plan_limited_reason")   // p. ej. 'automations.active.max'

model WorkspaceEntitlementOverride {   // aprobado en V2; UI en P0-D
  id String @id @default(cuid()); workspaceId String; key String; value Json
  reason String; expiresAt DateTime?; createdById String?; createdAt DateTime @default(now())
  @@unique([workspaceId, key])
}
```

- `applyPlanLimits` se ejecuta al cambiar de plan efectivo (downgrade, expiración, fin de trial). Marca con `planLimitedAt` lo que excede, conservando lo más antiguo:
  - flujos y reglas: se dejan de ejecutar;
  - canales: no envían;
  - journeys: no inscriben.
- `releasePlanLimits` limpia los marcadores cuando vuelve la capacidad.
- Los motores ya filtran por estado; se agrega `planLimitedAt: null` a sus consultas.
- Como el estado se deriva por fecha, la expiración también se detecta en el barrido del cron (sin depender de un evento).

## 3. Decisiones que necesito

**D1. Números por plan** (hoy provisionales, heredados de la beta). Propuesta de partida, para ajustar:

| | FREE | START | PRO | SCALE |
|---|---|---|---|---|
| users.max | 1 | 3 | 8 | 20 |
| contacts.max | 300 | 1.000 | 5.000 | 20.000 |
| channels.max | ver D2 | 1 | 2 | 5 |
| automations.active.max | ver D2 | 5 | 20 | 100 |
| modules.ai | no | sí | sí | sí |
| modules.quotes | no | no | sí | sí |
| modules.orders | no | sí | sí | sí |
| modules.campaigns | no | no | sí | sí |
| Shopify | no | no | no | sí |
| ai.monthlyBudget (CLP) | 0 | 20.000 | 60.000 | 200.000 |
| messages.monthly | 0 | 500 | 2.000 | 8.000 |
| emails.monthly | 0 | 0 | 10.000 | 50.000 |

**D2. FREE: acciones gratuitas vs. las que consumen infraestructura** (lo que dejaste para P0-C). Propuesta:
- **Gratis en FREE:** automatizaciones **internas**, es decir, las que solo etiquetan, asignan, mueven etapa o crean tareas, sin enviar nada ni llamar a IA; con `automations.active.max = 3`. Los flujos con nodos que envían mensajes, email o IA quedan bloqueados en FREE.
- **Canales en FREE:** mi recomendación es `channels.max = 0` en esta etapa: recibir y responder a mano igual consume infraestructura (webhooks, media, storage). La alternativa es permitir 1 canal solo con respuesta humana, sin plantillas, IA ni campañas.

**D3. Excedentes (`overages`).** Hoy existen en el modelo (cobrar el excedente en vez de bloquear), pero no se cobran en ningún lado. Propuesta: en P0-C **bloquear siempre** y dejar los excedentes para cuando exista facturación del excedente.

**D4. Orden de lo que se degrada.** Propuesta: se conserva lo más antiguo y se limita lo más reciente. La alternativa es que el cliente elija qué mantener (UI en P0-D).

**D5. SUSPENDED.** Hoy es bloqueo total. ¿Pasamos a solo lectura (ver y exportar datos, sin escribir), o seguimos con el bloqueo total?

**D6. Visibilidad de lo no incluido.** Propuesta: mostrarlo bloqueado con "Disponible en PRO", en vez de ocultarlo.

## 4. Plan de implementación (una vez decidido)

1. `lib/entitlements` completo (catálogo, config, resolver puro con tests, enforce) y reescritura de `hasCapability`/`checkAllowance` encima.
2. Los 8 gates nuevos de backend, con tests de cada uno.
3. Migración aditiva: marcadores `planLimited*` y `WorkspaceEntitlementOverride`. Solo en `crm_pruebas`.
4. `applyPlanLimits` / `releasePlanLimits`, invocados por las operaciones de P0-B y por el barrido del cron. Motores con filtro `planLimitedAt: null`.
5. Frontend: provider, `requires` en el sidebar y un `<Gate>` en las páginas de módulos.
6. Smoke P0-C: por cada plan (FREE/START/PRO/SCALE), cada módulo y límite, más downgrade → marca, upgrade → libera, nada se borra, override por workspace y SUSPENDED.


---

## 5. Arquitectura implementada

### Catalogo (fuente unica)
`src/lib/entitlements/config.ts`. `plan-catalog.ts` y los terminos legacy (`capabilities`/`allowances`) se DERIVAN de aqui; no hay segunda tabla de numeros. Sin overage: llegar al limite bloquea lo que aumenta el uso.

| | FREE | START | PRO | SCALE |
|---|---|---|---|---|
| users.max | 1 | 2 | 5 | 15 |
| contacts.max | 300 | 2.500 | 10.000 | 50.000 |
| channels.max | 0 | 2 | 4 | 10 |
| automations.active.max | 3 | 10 | 50 | 200 |
| agents.max | 0 | 1 | 5 | 20 |
| ai.monthlyCredits | 0 | 200 | 1.000 | 4.000 |
| quotes | no | si | si | si |
| commerce / shopify / recovery | no | no | si | si |
| campaigns | no | basic | si | si |
| analytics.advanced | no | no | si | si |
| api.advanced | no | no | no | si |

Cupos legacy: `emails` y `campaign_contacts` = 0 (coste de Upzites no aprobado); `conversations` = beta (500/2.000/8.000), medido y no aplicado (lo factura Meta a la WABA del cliente); `whatsapp_numbers` → `channels.max`; `ai_cost_clp` → creditos. Planes legacy (`monthly`, `beta-*`): se derivan de sus capacidades, lo no limitado toma el techo de SCALE, y no se reconcilian hasta su clasificacion (P0-D). `campaigns: 'basic'` = journeys; `true` = ademas masivos y email promocional.

### API
`getWorkspaceEntitlements(ws)` → `can(key)`, `limit(key)`, `usage(key)`, `remaining(key)`. Gates: `assertFeature`, `assertCanGrow`, `assertRequirements` (lanzan `EntitlementError`: 403 `PLAN_FEATURE`, 409 `PLAN_LIMIT`, 423 `WORKSPACE_SUSPENDED`, con `requiredPlan`). `hasCapability`/`checkAllowance` quedan como fachadas. Ningun consumidor pregunta por el nombre del plan (test estatico).

### Serializacion de cupos
`entitlements/lock.ts`: `withEntitlementLock(workspaceId, limite, (tx, guard) => ...)` toma `pg_advisory_xact_lock(hashtextextended('entitlement:<ws>:<limite>'))`, hace el chequeo final con `tx` y persiste con `tx`. Aplicado a memberships (`addMembershipWithinPlan`), canales (WhatsApp, Instagram/Messenger), publicacion de flujos (dentro de la transaccion de `saveFlow`), reglas, agentes, alta e importacion de contactos. Nunca hay llamadas externas dentro del lock: la verificacion con el proveedor ocurre antes.

### Contactos entrantes
WhatsApp, Instagram/Messenger y formularios publicos crean el contacto aunque el uso quede sobre el limite y se audita `contacts.inbound_over_limit`. Se bloquean las altas proactivas (crear a mano, importar). Aviso persistente en el dashboard cuando el uso ≥ limite.

### Degradacion reversible
`planLimitedAt`/`planLimitedReason` (ortogonal al estado de negocio) en memberships, canales, flujos, reglas, journeys y agentes. `reconcileWorkspaceEntitlements(ws)`: determinista (OWNER > ADMIN > MEMBER, luego `createdAt`, `id`; nunca sin OWNER), idempotente y reversible; nunca borra, desconecta ni toca credenciales. Corre tras cada operacion de `subscription-admin` y en el barrido `SCAN_WORKSPACE_HEALTH` (expiracion por fecha). SUSPENDED no se reconcilia: es bloqueo total (423 en el proxy). Las reglas de sistema (`presetKey`) no ocupan cupo.

### Creditos de IA
`weightedTokens = input + output*4`; `credits = ceil(weightedTokens * mult(proveedor) * mult(modelo) / 1000)` por inferencia. Factores en `AI_CREDITS` (multiplicadores 1 por defecto). Contador mensual `UsageCounter(metric='ai_credits')` en creditos enteros; el mes calendario reinicia la ventana. El runner (incluido el simulador) verifica antes de cada inferencia.

### UI
Funcion no incluida por PLAN: visible y bloqueada ("Disponible en X") en sidebar y paginas; lo existente sigue visible. ROL y WORKSPACE PROFILE son capas separadas (P0-E).

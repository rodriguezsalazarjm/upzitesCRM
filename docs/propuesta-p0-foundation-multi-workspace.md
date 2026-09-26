# P0-FOUNDATION — Usuario global, memberships y roles de plataforma

Estado: **propuesta para revisión, nada implementado.** Fecha: 2026-09-26.
Complementa `propuesta-subscriptions-v2-adaptive-workspace.md` y se ejecuta **antes** de P0-A.

---

## 0. Resumen

- Hoy `User` pertenece a un solo workspace (`users.workspace_id NOT NULL`) y el email es único **por workspace**, no global.
- El resto de la app casi no toca esa columna: consume `requireCurrentUser().workspace.id`, que sale de la cookie de sesión. Eso permite hacer la migración **sin tocar las ~270 lecturas del workspace**: basta con cambiar cómo se resuelve el contexto.
- La propuesta: `User` global + `WorkspaceMembership (OWNER/ADMIN/MEMBER)` + `User.platformRole (USER/PLATFORM_ADMIN/SUPER_ADMIN)`, workspace activo en la cookie firmada **y verificado contra membership en cada request**, soporte cross-tenant solo mediante una `SupportSession` auditada.
- Migración en 3 pasos, el primero puramente aditivo; `users.workspace_id` y `users.role` se quedan como legacy hasta el paso 3.
- Encontré dos problemas previos que esta fase debe cerrar: referencias cross-tenant sin validar en oportunidades y un webhook de Mercado Pago que clasifica "suscripción" por defecto (§9.4 y §9.5).

---

## 1. Inventario: qué depende hoy de `User.workspaceId`

Medido en `apps/crm` (rama `feat/p0a-platform-admin-subscription-state`).

### 1.1 Dependencias directas de la columna — 11 sitios en 10 archivos de runtime

| # | Archivo | Qué hace | Cambio |
|---|---|---|---|
| 1 | `src/lib/auth.ts:123` | `getCurrentUser` busca `{ id, workspaceId: session.workspaceId }` | Resolver por membership |
| 2 | `src/app/api/auth/login/route.ts:55` | Mete `user.workspaceId` en la cookie | Elegir workspace activo |
| 3 | `src/lib/subscription.ts:222` | Alta de cliente crea `User` con `workspaceId` | + crear membership OWNER |
| 4 | `src/lib/conversations.ts:200` | Valida que el asignado pertenezca al workspace | `assertMember` |
| 5 | `src/lib/automation/engine.ts:416` | Ídem (motor legacy) | `assertMember` |
| 6 | `src/lib/automations/engine.ts:463` | Ídem (flujos) | `assertMember` |
| 7 | `src/lib/automations/service.ts:36` | Valida operador al guardar un flujo | `assertMember` |
| 8 | `src/lib/push/events.ts:30` | Destinatario explícito de push | `assertMember` |
| 9 | `src/lib/push/events.ts:38` | Destinatarios OWNER/ADMIN (usa **workspace + rol**) | Query a memberships |
| 10 | `src/lib/billing/usage.ts:185` | Cuenta usuarios para el límite del plan | Contar memberships ACTIVE |
| 11 | `src/lib/ops-data.ts:242` | Cuenta usuarios en resumen de billing | Contar memberships ACTIVE |

Los sitios 4–9 son el riesgo real: si no se migran, un usuario cuyo workspace "de origen" es A no podría ser asignado en B (falla segura), y el día que se borre la columna fallarían todos.

### 1.2 Dependen de que el email identifique a una sola persona — 3 sitios

`api/auth/login/route.ts:27`, `api/auth/password-reset/route.ts:20` y `lib/subscription.ts:201` hacen `findFirst({ email })`. Hoy el schema permite el mismo email en dos workspaces; si existiera ese caso, el login elige una fila arbitraria. El alta ya rechaza emails repetidos globalmente, así que en datos reales no debería haber duplicados, pero hay que **verificarlo antes de migrar** (§6.1).

### 1.3 Scripts, seeds y fixtures — 7 sitios directos + 3 por email

Directos: `prisma/seed.ts:216`, `prisma/seed-alvaro.ts:82` (usa la unique compuesta `workspaceId_email`, que desaparece), `scripts/smoke-beta.ts:425`, `scripts/visual/fixtures.ts:17` y `:21`, `scripts/fixtures/request-context.ts:19` (firma cookies de prueba), `scripts/platform-admin.ts:64` (CLI de P0-A).
Por email: `scripts/seed-demo.ts:59`, `scripts/visual/c2-fixtures.ts:12`, `scripts/visual/fixtures.ts:12`.

### 1.4 Dependencias indirectas (vía sesión) — no cambian si se respeta el contrato

- `user.workspace.id`: **267 ocurrencias en 93 archivos** de `src` (335 / 100 contando scripts y tests).
- `getCurrentWorkspaceId()` (`lib/crm-data.ts:81`): 29 llamadas en 15 archivos.
- `requireCurrentUser` / `getCurrentUser`: 92 archivos, 72 de ellos rutas API.

Todos leen el workspace de la sesión, no de la columna. Si `requireCurrentUser()` sigue devolviendo `{ id, name, email, role, workspace: { id, name, slug } }` pero calculado desde el workspace activo verificado, **ninguno de estos archivos cambia**.

### 1.5 Rol de workspace — 20 comprobaciones en 17 archivos

`UserRole` (`OWNER/ADMIN/SALES`) se compara en: `configuracion/page.tsx`, `ia/agente/page.tsx`, `api/agent-settings`, `api/agents/[id]/publish`, `api/billing/checkout`, `api/ops/flags`, `api/pricing-rule-sets/[id]/archive|publish`, `lib/automations/roles.ts`, `lib/marketing/roles.ts`, `lib/quotes/roles.ts`, `lib/conversations.ts`, `lib/dev-demo.ts`, `lib/mercado-pago.ts`, `lib/onboarding/activation.ts`, `lib/push/events.ts`, `lib/subscription.ts`. El rol ya se lee de la base en cada request (el de la cookie no se usa), así que el cambio es de tipo: `SALES` pasa a `MEMBER`.

### 1.6 Lo que no se ve afectado

Webhooks, `/api/internal/*`, jobs, outbox y captura pública resuelven el workspace desde el propio registro (canal, `publicKey`, `external_reference`) y nunca desde la sesión. No cambian.

---

## 2. Enums

```prisma
/// Autorización sobre la PLATAFORMA (Upzites Flow como SaaS). Independiente de
/// cualquier workspace: ser OWNER de un workspace no da nada aquí.
enum PlatformRole {
  USER            // cliente normal; no ve nada de plataforma
  PLATFORM_ADMIN  // soporte/operación: Ops, clientes, suscripciones, pagos manuales
  SUPER_ADMIN     // todo lo anterior + gestionar roles de plataforma y precios
}

/// Autorización DENTRO de un workspace.
enum WorkspaceRole {
  OWNER   // dueño: billing del workspace, borrar workspace, gestionar miembros
  ADMIN   // configuración, integraciones, publicar agentes/automatizaciones
  MEMBER  // operación diaria (el SALES actual)
}

enum MembershipStatus {
  ACTIVE
  SUSPENDED // p. ej. exceso de usuarios tras un downgrade: nunca se borra (decisión V2)
}

enum SupportAccessMode {
  READ_ONLY
  READ_WRITE
}
```

Diferencia práctica PLATFORM_ADMIN vs SUPER_ADMIN: solo SUPER_ADMIN puede conceder/quitar roles de plataforma, editar el Price Book y dar `COMP`. Todo lo demás de Platform Admin lo pueden ambos.

---

## 3. Schema propuesto

### 3.1 `WorkspaceMembership` (nuevo)

```prisma
model WorkspaceMembership {
  id          String           @id @default(cuid())
  userId      String           @map("user_id")
  workspaceId String           @map("workspace_id")
  role        WorkspaceRole    @default(MEMBER)
  status      MembershipStatus @default(ACTIVE)
  invitedById String?          @map("invited_by_id")
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@index([workspaceId, status, role])
  @@map("workspace_memberships")
}
```

Invitaciones (`WorkspaceInvitation`) quedan para P0-D; el schema no las bloquea.

### 3.2 Cambios a `User`

```prisma
model User {
  id           String       @id @default(cuid())
  email        String       @unique            // paso 2: pasa a ser global
  name         String
  passwordHash String       @map("password_hash")
  platformRole PlatformRole @default(USER) @map("platform_role")

  /// Preferencia, NO autorización: a qué workspace entrar al hacer login.
  /// Siempre se re-verifica contra memberships.
  lastActiveWorkspaceId String? @map("last_active_workspace_id")

  /// LEGACY. Workspace "de origen". Se sigue escribiendo en el paso 1,
  /// deja de leerse, pasa a nullable en el paso 2 y se elimina en el paso 3.
  workspaceId String?  @map("workspace_id")
  /// LEGACY. Reemplazado por WorkspaceMembership.role. Se elimina en el paso 3.
  role        UserRole @default(SALES)

  memberships        WorkspaceMembership[]
  lastActiveWorkspace Workspace? @relation("UserLastActiveWorkspace", fields: [lastActiveWorkspaceId], references: [id], onDelete: SetNull)
  // ... relaciones existentes sin cambios
}
```

Se elimina `@@unique([workspaceId, email])` (paso 2) y el `platformAdmin PlatformAdmin?` de P0-A (§10.3).

### 3.3 `Workspace`

- `memberships WorkspaceMembership[]` y la relación inversa de `lastActiveWorkspace`.
- **Propuesta (a decidir):** `Workspace.isInternal Boolean @default(false)`. Marca los negocios propios (UPZITES, 5 Minutos con Dios). Sirve para que las métricas SaaS (MRR, clientes, churn) excluyan los workspaces propios, independientemente de que su billing sea `COMP`. Los datos del workspace siguen igual de aislados; es solo una etiqueta para reporting de plataforma.
- 5 Minutos con Dios no necesita nada nuevo aquí: `WorkspaceProfile.businessType` ya existe. Con la decisión V2 (INFOPRODUCT como `commerceSubtype` de ECOMMERCE) se crea con `businessType = ECOMMERCE` y el subtipo llega en P0-E. Nota: el enum actual todavía tiene `INFOPRODUCT` como `BusinessType`; esa limpieza sigue en P0-E.

### 3.4 Soporte y auditoría de plataforma (nuevos)

```prisma
/// Acceso explícito de un operador a un workspace del que NO es miembro.
model SupportSession {
  id          String            @id @default(cuid())
  actorUserId String            @map("actor_user_id")
  workspaceId String            @map("workspace_id")
  mode        SupportAccessMode @default(READ_ONLY)
  reason      String
  startedAt   DateTime          @default(now()) @map("started_at")
  expiresAt   DateTime          @map("expires_at")      // máx. 60 min
  endedAt     DateTime?         @map("ended_at")

  @@index([workspaceId, startedAt])
  @@index([actorUserId, endedAt])
  @@map("support_sessions")
}

/// Log de acciones de plataforma. Sin FK con cascade: debe sobrevivir al borrado
/// del workspace o del usuario objetivo.
model PlatformAuditLog {
  id               String   @id @default(cuid())
  actorUserId      String   @map("actor_user_id")
  action           String   // platform_role.granted, support.started, subscription.manual_payment, ...
  targetWorkspaceId String? @map("target_workspace_id")
  targetUserId     String?  @map("target_user_id")
  supportSessionId String?  @map("support_session_id")
  metadata         Json?
  createdAt        DateTime @default(now()) @map("created_at")

  @@index([actorUserId, createdAt])
  @@index([targetWorkspaceId, createdAt])
  @@map("platform_audit_logs")
}
```

Durante una SupportSession, las escrituras dentro del workspace se registran además en el `AuditLog` del propio workspace con `metadata.supportSessionId`, para que el cliente también las vea.

---

## 4. Workspace activo

**Fuente de verdad del contexto:** la cookie de sesión firmada lleva `activeWorkspaceId`, y en **cada request** el servidor comprueba que exista una membership ACTIVE (o una SupportSession vigente) para `(userId, activeWorkspaceId)`. El cliente nunca elige el workspace de una operación; solo puede pedir un cambio, que también se verifica.

**Por qué en la cookie y no en la URL (`/w/[slug]/...`):** la URL obligaría a reescribir todas las rutas y los 92 archivos que resuelven sesión. La cookie mantiene intactas las rutas actuales. La URL con slug queda como evolución posible más adelante; este diseño no la impide.

**Preferencia persistente:** `User.lastActiveWorkspaceId`, actualizada en cada cambio. Solo decide dónde entrar al hacer login; nunca autoriza nada.

**Elección al hacer login:**
1. `lastActiveWorkspaceId`, si hay membership ACTIVE.
2. Si no, la membership OWNER más antigua; si no, la más antigua de cualquier rol.
3. Sin memberships y con `platformRole ≠ USER` → `/platform`.
4. Sin memberships y `USER` → pantalla "sin acceso a ningún workspace" (no 500).

**Problema de pestañas:** la cookie es una sola por navegador. Si en la pestaña B se cambia a "5 Minutos con Dios", un formulario abierto en la pestaña A (UPZITES) guardaría en el workspace nuevo. Mitigación:
- Las páginas renderizan el `workspaceId` con el que se generaron; el cliente lo envía en `x-upzites-workspace` en cada mutación.
- El servidor **no lo usa para autorizar**: solo lo compara con el workspace de la sesión y responde `409 WORKSPACE_CHANGED` si difieren. La UI muestra "Cambiaste de negocio en otra pestaña" y recarga.
- Al cambiar, un `BroadcastChannel` avisa a las demás pestañas para que se recarguen.

---

## 5. Auth y contexto de servidor

### 5.1 Cookie v2

```ts
type SessionPayloadV2 = {
  v: 2;
  userId: string;
  activeWorkspaceId: string | null; // null = sin workspace (solo operadores)
  supportSessionId?: string;        // presente solo en modo soporte
  exp: number;
};
```

Se elimina `role` de la cookie; hoy ya no se usa (el rol se lee de la base).
**Compatibilidad:** una cookie v1 `{ userId, workspaceId, role }` se acepta como `activeWorkspaceId = workspaceId`. Gracias al backfill, esa membership existe, así que **nadie tiene que volver a iniciar sesión**. La cookie se reemite en v2 en la siguiente respuesta que pueda escribir cookies (route handler o server action). Las cookies v1 desaparecen solas en ≤ 7 días (TTL actual).

### 5.2 API de contexto

```ts
// lib/auth/context.ts
type WorkspaceContext = {
  user: { id: string; name: string; email: string; platformRole: PlatformRole };
  workspace: { id: string; name: string; slug: string };
  role: WorkspaceRole;              // efectivo en ESTE workspace
  access: 'MEMBER' | 'SUPPORT';
  supportSession?: { id: string; mode: SupportAccessMode; expiresAt: Date };
};

getWorkspaceContext(): Promise<WorkspaceContext | null>   // cacheado por request con React cache()
requireWorkspaceContext(): Promise<WorkspaceContext>      // sin sesión → /login; sin workspace válido → /workspaces
requireWorkspaceRole(min: WorkspaceRole)                  // 403
requirePlatformRole(min: PlatformRole)                    // 404, como ya hace P0-A
assertMember(workspaceId: string, userId: string)         // reemplaza los sitios 4–9 de §1.1
listMyWorkspaces(): Promise<Array<{ id; name; slug; role }>>
```

**Adaptador para no tocar 93 archivos:** `requireCurrentUser()` y `getCurrentUser()` se reimplementan sobre `requireWorkspaceContext()` y devuelven la misma forma de hoy (`{ id, name, email, role, workspace }`), con `role` ahora de tipo `WorkspaceRole`. El código nuevo usa el contexto; el existente se migra cuando se toque.

**Resolución (en orden):**
1. Validar la firma y la expiración de la cookie.
2. Cargar el `User` (con `platformRole`).
3. Si hay `supportSessionId`: la SupportSession debe ser del mismo usuario, estar vigente y sin cerrar, apuntar a `activeWorkspaceId`, y el usuario debe seguir siendo PLATFORM_ADMIN o SUPER_ADMIN. → `access = SUPPORT`, `role = ADMIN` (READ_WRITE) o `role = MEMBER` y bloqueo de mutaciones (READ_ONLY).
4. Si no, buscar la membership `(userId, activeWorkspaceId, ACTIVE)`. → `access = MEMBER`.
5. Si nada es válido, redirigir a `/workspaces`, que es un route handler: elige un workspace según §4, reemite la cookie y vuelve. Esto hace falta porque un Server Component no puede escribir cookies.

`platformRole` **no** se guarda en la cookie: se consulta en cada request, igual que decidió P0-A, para que revocarlo tenga efecto inmediato.

### 5.3 Cambio de workspace

`POST /api/workspaces/switch { workspaceId }`:
1. `requireWorkspaceContext()` (o solo sesión si no hay workspace activo).
2. Membership ACTIVE en el destino → reemitir la cookie con el nuevo `activeWorkspaceId`, sin `supportSessionId`; actualizar `lastActiveWorkspaceId`; `AuditLog` del destino con `workspace.switched_in`.
3. Sin membership → **404**, aunque el usuario sea SUPER_ADMIN. Entrar sin membership requiere la ruta de soporte explícita.
4. Rate limit con el `enforce()` existente.

Selector en el sidebar (`[ UPZITES ▼ ]`): lista `listMyWorkspaces()`. Para operadores agrega "Entrar como soporte…" y un link a `/platform`. Si hay un solo workspace, se muestra el nombre sin desplegable (igual que hoy).

---

## 6. Migración backward-compatible

### 6.1 Pre-flight (script de solo lectura, se corre contra prod antes de nada)

```sql
-- 1. emails duplicados entre workspaces (bloquea el paso 2 si hay filas)
SELECT lower(email), count(*), array_agg(workspace_id) FROM users GROUP BY lower(email) HAVING count(*) > 1;
-- 2. emails no normalizados
SELECT id, email FROM users WHERE email <> lower(trim(email));
-- 3. workspaces sin OWNER (quedarían sin dueño en memberships)
SELECT w.id, w.name FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.workspace_id = w.id AND u.role = 'OWNER');
-- 4. conteos para verificar después
SELECT count(*) FROM users; SELECT role, count(*) FROM users GROUP BY role;
```

Si aparecen duplicados: son personas distintas con contraseñas distintas y **no se fusionan automáticamente**. Se resuelven a mano (renombrar el email de una, o fusionar con aprobación tuya) antes del paso 2.

### 6.2 Paso 1 — aditivo (sin riesgo para el auth actual)

Una migración:
1. Crear los enums `PlatformRole`, `WorkspaceRole`, `MembershipStatus` y `SupportAccessMode`.
2. `ALTER TABLE users ADD platform_role ... DEFAULT 'USER'`, `ADD last_active_workspace_id` (FK `SET NULL`).
3. Crear `workspace_memberships`, `support_sessions` y `platform_audit_logs`.
4. Backfill, idempotente:
   ```sql
   INSERT INTO workspace_memberships (id, user_id, workspace_id, role, status, created_at, updated_at)
   SELECT 'wm_' || u.id, u.id, u.workspace_id,
          CASE u.role WHEN 'OWNER' THEN 'OWNER' WHEN 'ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END::"WorkspaceRole",
          'ACTIVE', u.created_at, now()
   FROM users u
   ON CONFLICT (user_id, workspace_id) DO NOTHING;
   UPDATE users SET last_active_workspace_id = workspace_id WHERE last_active_workspace_id IS NULL;
   ```
5. Traspasar P0-A: `UPDATE users SET platform_role = 'SUPER_ADMIN' WHERE id IN (SELECT user_id FROM platform_admins)` y `DROP TABLE platform_admins` (§10.3).

`users.workspace_id` sigue `NOT NULL` y `users.role` sigue existiendo. El código viejo desplegado seguiría funcionando sobre este schema. **Rollback del paso 1:** revertir el código; las tablas nuevas pueden quedarse.

Código del paso 1 (mismo PR): contexto nuevo, adaptador de `requireCurrentUser`, cookie v2 con lectura v1, `assertMember` en los sitios 4–9, conteos por membership (10–11), alta de cliente que crea User + Membership OWNER + sigue escribiendo `users.workspace_id` (**dual-write**), switch y selector, y `isPlatformAdmin` leyendo `platformRole`.

Verificación post-deploy: `count(workspace_memberships) = count(users)`, cada workspace con al menos un OWNER, login real con una cuenta existente.

### 6.3 Paso 2 — email global y columna legacy nullable (tras 1–2 semanas estable)

- Pre-flight 6.1 sin duplicados → `CREATE UNIQUE INDEX users_email_key ON users (email)`; `DROP INDEX users_workspace_id_email_key`.
- `ALTER TABLE users ALTER COLUMN workspace_id DROP NOT NULL`.
- El código deja de escribir `workspace_id` y `role` en usuarios nuevos. Hay que actualizar `seed-alvaro.ts`, que usa `workspaceId_email`.

### 6.4 Paso 3 — limpieza (P0-D o después)

`DROP COLUMN users.workspace_id`, `DROP COLUMN users.role`, `DROP TYPE "UserRole"`. Solo cuando un grep confirme que no queda ninguna lectura y el paso 2 lleve un ciclo completo de billing estable.

### 6.5 De `workspaceId` a `activeWorkspaceId`

Se hace **en la cookie, no en `User`**. `User.lastActiveWorkspaceId` es solo una preferencia. Las sesiones no se rompen porque el nombre del campo cambia junto con la versión de la cookie (`v: 2`), y el lector acepta ambas durante el TTL.

---

## 7. Impacto en queries actuales

- **Tenant data (Contacts, Orders, Payments, Automations, Channels, Products, Analytics, …):** sin cambios. Todas filtran por `workspaceId` tomado de la sesión, y ese valor ahora viene verificado por membership.
- **Queries sobre `User`:** los 11 sitios de §1.1. Las comprobaciones de pertenencia pasan a `assertMember`; los conteos, a memberships ACTIVE; el reparto de push, a `membership.role IN (OWNER, ADMIN)`.
- **Listas de "operadores/asignables"** (selects de dueño, asignación de conversaciones): deben salir de `workspace_memberships`, no de `users.workspace_id`. Si no, un miembro invitado desde otro workspace no aparecería.
- **Límite `users` del plan:** cuenta memberships ACTIVE del workspace, no filas de `User`. Una persona en 3 workspaces consume 1 usuario en cada uno.
- **Relaciones de usuario en datos del tenant** (`Contact.ownerId`, `Opportunity.ownerId`, `Conversation.assignedUserId`, `Activity.creatorId`, `Message.senderId`, `PushSubscription`): siguen apuntando a `User`. Toda escritura que reciba un `userId` del cliente debe validarlo con `assertMember`. Si se suspende o elimina una membership, los registros históricos se conservan.
- **PushSubscription** ya lleva `workspaceId` y `userId`: se notifica solo si hay membership ACTIVE en ese workspace. Si no, un ex-miembro seguiría recibiendo pushes.

---

## 8. Impacto en sesiones y auth

| Área | Impacto |
|---|---|
| Sesiones vigentes | Siguen válidas (lectura v1 + backfill). No hay logout masivo. |
| Login | Busca por email global y elige el workspace activo (§4). |
| Reset de contraseña | Sin cambio funcional; requiere el email único (paso 2) para ser determinista. |
| Alta de cliente | Crea User + Workspace + Membership OWNER en una transacción. Si el email ya existe: hoy devuelve error; en P0-D será "crear otro workspace con tu cuenta". |
| Dev demo (`DEV_DEMO_USER`) | Se adapta a la forma del contexto: `role = OWNER`, `platformRole = USER`. |
| OAuth de MP/Meta | El `state` ya liga `userId + workspaceId`, y el callback de MP rechaza si el workspace activo cambió. Se mantiene: el callback verifica la membership en el workspace del `state` y rechaza si difiere del activo, así que no se conecta una cuenta al negocio equivocado. |
| Fixtures de test | `scripts/fixtures/request-context.ts` firma cookies v2. |

---

## 9. Aislamiento entre tenants

1. **Una sola fuente de `workspaceId`** en rutas normales: el contexto. Ninguna ruta no-platform acepta `workspaceId` en body o query para autorizar. (Hoy ya se cumple; no hay schemas zod con `workspaceId` en `src/app/api`.)
2. **Validar toda referencia a otra entidad** recibida del cliente (`contactId`, `ownerId`, `companyId`, `userId`, …): debe pertenecer al workspace del contexto.
3. **Cross-tenant solo en `lib/platform/*` y `app/(platform)/*`**, detrás de `requirePlatformRole`. Un test estático impide importar `lib/platform` desde `app/(dashboard)` y `app/api` no-platform.
4. **Hallazgo previo — referencias cross-tenant en oportunidades:** `api/opportunities/route.ts:60` y `api/opportunities/[id]/route.ts:62` guardan `ownerId`, `contactId` y `companyId` tal como llegan, sin verificar que sean del workspace. Con esos IDs, un usuario de A puede enlazar una oportunidad suya a un contacto o usuario de B. No expone datos por sí solo, pero rompe el aislamiento y hoy existe independientemente de esta fase. Propongo cerrarlo en P0-FOUNDATION con `assertMember` y validación de pertenencia.
5. **Hallazgo previo — ledgers SaaS vs. commerce:** `/api/billing/webhook` atiende pagos de suscripción y pedidos, y `classifyPayment()` (`lib/commerce/payment-webhook.ts:262`) trata como **suscripción todo lo que no venga marcado `kind: 'order'`**. Cuando el SUPER_ADMIN venda con su propia cuenta de MP (por ejemplo, si conecta a 5 Minutos con Dios la misma cuenta que usa la plataforma), cualquier pago de esa cuenta sin la marca pasaría por la rama de suscripción. Propongo:
   - **Ahora (FOUNDATION):** invertir el default a *fail-closed*. Suscripción solo con `kind: 'saas_subscription'` o si coincide `mpPreferenceId` con una `WorkspaceSubscription` existente (esto cubre las preferencias legacy en vuelo). Todo lo demás se ignora con un 200 y un log.
   - **P0-B:** separar endpoints (`/api/billing/webhook` solo SaaS; `/api/commerce/mercado-pago/webhook/[workspaceId]` solo commerce).
   - **Operativo:** recomiendo que la cuenta MP que cobra el SaaS **no** sea la misma que se conecte como vendedora en un workspace propio.
   - Los modelos ya están separados (`WorkspaceSubscription` vs. `CustomerOrder`/`Payment` + `MercadoPagoConnection` por workspace). La regla: el código de billing SaaS nunca lee `MercadoPagoConnection` ni `Payment`, y el de commerce nunca usa el token de plataforma para cobrar. El token de plataforma solo se usa para el intercambio OAuth, que es legítimo.
6. **Guardia en test (no en prod al inicio):** una extensión de Prisma, activa solo en `NODE_ENV=test` y smoke, que lanza un error si un `findMany/findFirst/updateMany/deleteMany` sobre un modelo tenant no incluye `workspaceId` en el `where`, salvo en llamadas marcadas como platform. Detecta queries globales accidentales en las smoke existentes.

---

## 10. SUPER_ADMIN

### 10.1 Qué es

Un `User` normal con `platformRole = SUPER_ADMIN` y memberships normales (OWNER) en sus negocios: UPZITES, 5 Minutos con Dios, etc. En esos workspaces opera exactamente como cualquier OWNER, sin privilegios extra y sin ver datos de otros tenants.

### 10.2 Dos modos, nunca mezclados

- **Operar mis negocios:** selector de workspace y memberships. Sin auditoría especial, más allá del AuditLog normal.
- **Plataforma (`/platform`):** métricas globales, Ops, clientes, suscripciones, pagos manuales y creación de workspaces. Son queries cross-tenant de solo agregados y metadatos; los datos del tenant (contactos, conversaciones) no se ven desde aquí.
- **Soporte a un cliente:** `POST /api/platform/support-sessions { workspaceId, reason, mode }` crea la SupportSession (TTL 60 min, READ_ONLY por defecto) y escribe en PlatformAuditLog. Mientras dura, se ve un banner fijo "Modo soporte · Cliente X · termina en 42 min · Salir". READ_WRITE exige `reason` y queda marcado en ambos logs. Al salir o expirar, se vuelve al workspace propio anterior.

Crear un workspace desde Platform Admin **no** da membership automática al operador: si lo necesita, se la asigna explícitamente (queda auditado). Para los negocios propios, el SUPER_ADMIN se crea como OWNER.

### 10.3 Relación con P0-A (implementado sin commitear)

P0-A creó la tabla `platform_admins` + `isPlatformAdmin()` + CLI. Solo está aplicado en `crm_pruebas`. Propuesta:
- Conservar la migración `20260925200000_platform_admins` (ya aplicada en pruebas; borrarla causaría drift) y, en el paso 1 de FOUNDATION, copiar sus filas a `users.platform_role = 'SUPER_ADMIN'` y eliminar la tabla.
- `isPlatformAdmin(userId)` mantiene su firma y pasa a leer `platformRole IN (PLATFORM_ADMIN, SUPER_ADMIN)`. El gating de `/ops` y el sidebar de P0-A no cambian.
- El CLI `scripts/platform-admin.ts` pasa a `grant/revoke --role` y escribe en PlatformAuditLog.
- Orden de ramas: FOUNDATION sale de la base de P0-A; P0-A se rebasea encima, y el único conflicto esperado es `platform-admin.ts`.

---

## 11. Tests necesarios

**Unitarios (`tsx --test`, `src/lib/auth/*.test.ts`):**
- Cookie v1 aceptada y mapeada; cookie v2; firma inválida; expirada.
- Resolución: membership ACTIVE ✔, SUSPENDED ✘, inexistente ✘, workspace borrado ✘.
- SupportSession: vigente ✔, expirada ✘, de otro actor ✘, actor degradado a USER ✘, READ_ONLY bloquea mutaciones.
- `requirePlatformRole`: USER→404, PLATFORM_ADMIN vs. SUPER_ADMIN en acciones reservadas.
- OWNER de workspace **no** pasa `requirePlatformRole`; SUPER_ADMIN **no** obtiene rol en un workspace sin membership o soporte.
- Elección de workspace en login (§4, los 4 casos).
- `classifyPayment` fail-closed: sin `kind` y sin preferencia conocida → ignorado.

**Smoke de aislamiento (`scripts/smoke-foundation.ts`, contra la DB de pruebas):**
- Usuario U con membership en A y B: el switch a B muestra solo datos de B y el switch a C (sin membership) devuelve 404.
- Mutación con `x-upzites-workspace: A` y sesión en B → 409, y nada escrito.
- Asignar a una conversación de A un usuario que solo es miembro de B → rechazado.
- Crear una oportunidad en A con `contactId`/`ownerId` de B → rechazado (regresión del hallazgo §9.4).
- Push de A a un usuario con membership suspendida → no se envía.
- Límite de usuarios: U en A y B cuenta 1 en cada uno.
- Un pago de pedido en un workspace interno no cambia ninguna `WorkspaceSubscription`, y un pago SaaS no crea `Payment`/`CustomerOrder`.
- La guardia Prisma de §9.6 está activa durante toda la smoke existente (`test:smoke:all`) sin romperla.

**Migración (contra una copia de prod en `crm_pruebas`):**
- El backfill crea exactamente una membership por usuario, con el rol mapeado; es idempotente al correrlo dos veces.
- Todos los workspaces tienen ≥ 1 OWNER.
- Una sesión emitida por el código viejo sigue funcionando con el código nuevo.
- Login de las cuentas reales (Alvaro, propietario) en la preview.

---

## 12. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Emails duplicados en prod bloquean el unique global | Baja (el alta ya lo impide) | Alto | Pre-flight §6.1; el paso 2 separado del paso 1 |
| Un sitio que valida pertenencia por `users.workspace_id` queda sin migrar | Media | Medio (falla cerrado, no filtra) | Inventario §1.1 cerrado; grep en CI; la columna sigue hasta el paso 3 |
| Formulario en una pestaña vieja escribe en otro workspace tras un switch | Media | Alto | Header de consistencia + 409 + BroadcastChannel |
| Default "suscripción" del webhook con cuenta MP compartida | Media al lanzar 5MCD | Alto | Fail-closed ahora; separar endpoints en P0-B; cuentas MP distintas |
| SUPER_ADMIN ve datos de clientes sin rastro | Baja | Alto (confianza, privacidad) | Solo vía SupportSession, TTL, banner, doble log |
| Server Components no pueden reemitir la cookie | Cierta | Bajo | Redirección a `/workspaces` (route handler) |
| Regresiones de rendimiento (1 query extra por request) | Baja | Bajo | Una sola query user+membership con `include`; `cache()` por request |
| Drift en `crm_pruebas` por `platform_admins` | Media | Bajo | No borrar esa migración; migrarla hacia adelante |
| Mezclar esta fase con el WIP de Meta en `release-hardening` | Media | Medio | Rama propia desde la base de P0-A; no integrar Meta (decisión V2) |

---

## 13. Decisiones que necesito de ti

1. **Modo soporte:** ¿READ_ONLY por defecto con elevación a READ_WRITE justificada (mi recomendación), o ADMIN directo con auditoría?
2. **`Workspace.isInternal`** para excluir tus negocios de las métricas SaaS: ¿sí?
3. **`SALES` → `MEMBER`:** ¿renombrar (recomendado, 20 sitios) o conservar `SALES` como etiqueta visible de MEMBER?
4. **PLATFORM_ADMIN vs. SUPER_ADMIN:** ¿te sirve el corte de §2 (solo SUPER_ADMIN gestiona roles, Price Book y COMP)?
5. **Cuenta MP del SaaS:** ¿la cuenta que cobrará el SaaS es la misma que usarás para vender en 5 Minutos con Dios? Si la respuesta es sí, el endurecimiento de §9.5 se vuelve bloqueante antes de lanzar el checkout de 5MCD.
6. **Corregir el hallazgo de oportunidades (§9.4)** dentro de FOUNDATION o como hotfix aparte en `release-hardening`.

## 14. Plan de ejecución de P0-FOUNDATION (una vez aprobado)

1. Correr el pre-flight en prod (solo lectura) y reportarte los resultados.
2. Paso 1: schema + backfill + contexto + adaptador + `assertMember` + cookie v2 + switch/selector + soporte + fail-closed MP + fix de oportunidades + tests. Aplicado solo en `crm_pruebas` y validado en la preview.
3. Reporte y tu aprobación → rebase de P0-A encima.
4. Paso 2 (email global, columna nullable) en un deploy aparte.
5. El paso 3 queda en el backlog de P0-D.

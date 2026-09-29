# P0-F — Gestión de equipo del workspace

Estado: implementado en `feat/p0f-workspace-team` (desde `204a144`, con P0-D y
P0-E en el historial). Migración `20260929180000_workspace_team` aplicada **solo
en crm_pruebas**.

Cada cliente gestiona su equipo en **Configuración → Equipo**
(`/configuracion/equipo`) sin depender de Platform Admin. Reutiliza User global,
WorkspaceMembership, WorkspaceInvitation (un solo sistema), `users.max`, el
email transaccional de plataforma y el contexto seguro de workspace.

## Schema

Único cambio (aditivo): `workspace_invitations.origin` (`InvitationOrigin`:
`PLATFORM` | `WORKSPACE`, default `PLATFORM` para filas previas). Sirve para que
un ADMIN solo gestione las invitaciones MEMBER creadas desde el workspace.

## Asientos (`lib/team/seats.ts`)

`getWorkspaceSeatUsage(workspaceId)` → `active`, `reserved`, `limit`,
`remaining`, `requiredPlan`.

- `active` = memberships ACTIVE (incluidas las limitadas por plan).
- `reserved` = invitaciones pendientes: sin aceptar, sin revocar y **no
  vencidas**. Una vencida deja de reservar aunque la fila exista (no hay
  barrido: el filtro por `expiresAt` es la regla).
- **Toda** invitación reserva asiento, de origen WORKSPACE o PLATFORM. Crear
  (y reenviar una vencida) corre bajo el lock de P0-C
  (`withEntitlementLock(ws, 'users.max')`): dos invitaciones simultáneas no
  toman el mismo último asiento. Sin bypass para PLATFORM_ADMIN ni
  SUPER_ADMIN; sobrepasar el límite sería una acción explícita y auditada
  aparte (no implementada).
- Reenviar reusa la fila (no reserva otro asiento); revocar libera en el acto.
- Aceptar vuelve a comprobar el asiento (defensa adicional).
- Downgrade: si `activos + reservadas > users.max`, las invitaciones más nuevas
  quedan **bloqueadas por plan** (derivado, sin status nuevo, sin borrar);
  aceptarlas devuelve `PLAN_LIMIT` y la UI muestra "Esta invitación requiere un
  cupo disponible".
- `addMembershipWithinPlan` también respeta las reservas.

## Permisos (`lib/team/permissions.ts`, aplicados en el servidor)

| | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| Ver equipo | sí | sí | sí (lectura) |
| Invitar | MEMBER, ADMIN | MEMBER | no |
| Cambiar roles / promover a OWNER | sí | no | no |
| Suspender / reactivar | todos (con protección de OWNER) | solo MEMBER | no |
| Revocar / reenviar invitaciones | todas | MEMBER de origen WORKSPACE | no |

Nadie invita directamente a un OWNER. Las APIs (`/api/team`,
`/api/team/invitations[/id]`, `/api/team/members/[userId]`) toman workspace y
actor del contexto; los schemas son estrictos (un `workspaceId` en el cuerpo da
400) y el objetivo se valida dentro del workspace activo (otro workspace → 404).

## Invitaciones

Mismo token de P0-D (hash-only, 7 días, un uso). Email de plataforma (no
consume `emails.monthly`); sin Resend la respuesta trae el enlace para copiar.
Email con cuenta existente → solo nueva membership (sin segundo User); aparece
en el selector. Aceptar dos veces con la misma cuenta es idempotente. Una
membership SUSPENDED nunca se reactiva por invitación (ni al crearla ni al
aceptarla): `MEMBERSHIP_SUSPENDED`.

## Roles, suspensión y OWNER (`lib/team/service.ts`)

- `changeWorkspaceRole()` es la única vía (auditada `workspace.member.role_changed`
  con from/to/actor).
- `suspendMember()`: `status = SUSPENDED`, sin borrar User ni membership. Pierde
  acceso a ese workspace (el contexto verifica en cada request), libera asiento,
  conserva sus otros workspaces; no recibe push ni es asignable (reglas de
  FOUNDATION); lo ya asignado conserva su userId; no se reasigna. `planLimitedAt`
  no se toca: "Limitado por tu plan" y "Suspendido por un administrador" son
  distintos.
- `reactivateMember()`: comprueba asiento bajo el lock de `users.max`.
- Protección de OWNER: degradar o suspender a un OWNER exige otro OWNER ACTIVE,
  bajo `pg_advisory_xact_lock('workspace-owners:<ws>')`. Dos degradaciones
  simultáneas de los dos últimos OWNER: pasa una. Se permiten varios OWNER.

Auditoría: `workspace.invitation.created|revoked|resent`,
`workspace.member.role_changed|suspended|reactivated`.

## Onboarding (P0-E)

"Invita a tu equipo" está en todos los presets → `/configuracion/equipo`.
FREE (`users.max = 1`): bloqueada ("Disponible desde Start"). teamSize SOLO: no
relevante. Solo OWNER/ADMIN. Se completa con otro miembro ACTIVE o una
invitación vigente (no por abrir la pantalla ni con una vencida).

## Tests

`test:team` (8, permisos y reparto de asientos), `smoke-p0f` (50: los 45 casos
de P0-F + 5 de invitaciones de /platform). smoke-p0d: casos 11, 17 y 18
adaptados (idempotencia al aceptar; no se crean invitaciones sin asiento).
Producción: aplicar migraciones de P0-D, P0-E y P0-F antes del deploy.

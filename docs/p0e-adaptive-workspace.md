# P0-E — Adaptive Workspace, personalización y onboarding

Estado: implementado en `feat/p0e-adaptive-workspace` (desde `1895a0f`, que
contiene P0-D). Migración `20260929120000_adaptive_workspace` aplicada **solo en
crm_pruebas**.

## Cuatro dimensiones, separadas

| Dimensión | Decide | Dónde |
|---|---|---|
| PLAN (entitlements) | disponible / bloqueado — autoridad final | `lib/entitlements` (P0-C) |
| ROL (workspace) | visible / administrable | `lib/workspace-roles.ts`, `NAV_ITEMS[].minRole` |
| PERFIL DE NEGOCIO | relevancia y prioridad (preset) | `WorkspaceProfile`, `lib/workspace-presets` |
| PREFERENCIAS | orden, ocultos, sidebar, dashboard | `WorkspaceUserPreference` (usuario × workspace) |

Un preset nunca concede una capacidad. Un entitlement nunca decide si un
módulo es relevante para el negocio.

## Migración (aditiva)

- `BusinessType` suma `APPOINTMENTS` y `GENERAL`. `INFOPRODUCT` queda en el enum
  como valor legacy (no se escribe); sus filas pasan a `ECOMMERCE` +
  `commerce_subtype = INFOPRODUCT`.
- Enums `CommerceSubtype`, `PrimaryGoal`, `TeamSize`.
- `workspace_profiles`: `commerce_subtype`, `primary_goal`, `team_size`,
  `preferred_channels`, `preset_key`, `preset_version`,
  `onboarding_completed_at`, `onboarding_completed_by`.
- `workspace_user_preferences` (único `user_id + workspace_id`).
- `preset_key` queda NULL: la app deduce el preset del tipo de negocio (GENERAL
  como fallback). No se aplica personalización durante la migración.

El wizard de activación ("Puesta en marcha") razona por modalidad de venta:
`wizardSalesMode()` traduce el perfil nuevo (ECOMMERCE + INFOPRODUCT →
digital; citas → servicios) sin reescribir sus reglas.

## Presets (código, versionados)

`src/lib/workspace-presets/{services,ecommerce,infoproduct,appointments,general}.ts`,
todos `v1`. Cada uno define `navigationOrder`, `defaultHiddenItems`,
`dashboardWidgets`, `onboardingChecklist`, `recommendedIntegrations` y
`recommendedAutomations`. La base guarda solo `presetKey` + `presetVersion`.

- `resolvePreset(profile)`: el preset aplicado manda aunque cambie el perfil;
  expone `recommendationDiffers` y `updateAvailable` (sin updater automático).
- Citas no tiene Agenda: solo módulos reales. "Analítica" apunta a `/insights`.
- Ningún preset nombra un negocio concreto (test estático).

## Navegación

`resolveNavigation()` (puro): 1) preset → prioridad/relevancia; 2) plan →
bloqueado ("Disponible en X"); 3) rol → se quita de todas las listas; 4)
preferencias → orden/ocultos/recuperados. Las preferencias no desbloquean ni
saltan el rol; los módulos de sistema no se ocultan.

### Rol: UI y servidor coherentes

- El rol mínimo de un módulo vive en `NAV_ITEMS[].minRole` (hoy: Billing =
  ADMIN). La página se protege con `requireModuleAccess('<id>')`, que lee ese
  mismo valor → MEMBER recibe **404** en `/billing` aunque escriba la URL (misma
  política que /platform). La API de checkout responde 403.
- El resto de módulos siguen la política existente: se ven para todos y las
  acciones administrativas se niegan en la API (UI en solo lectura).
- `/api/pipeline-stages` (crear/editar/borrar etapas) ahora exige OWNER/ADMIN.
- `src/lib/navigation/role-matrix.test.ts` (en `test:presets`) falla si un
  módulo con `minRole` no protege su página, si el guard aparece fuera de su
  página, o si una API administrativa listada no comprueba el rol.

## Sidebar

260 px por defecto, 220–340, colapsado 72. Resize con arrastre o flechas,
colapsar, ocultar y fijar módulos ("Más módulos"). Todo persiste por usuario ×
workspace (`PATCH /api/preferences`). Móvil: drawer fijo de 248 px, ignora el
ancho guardado. Drag & drop del orden queda para P1.

## Dashboard

Registro en `src/lib/dashboard/widgets/` (12 widgets, solo fuentes reales). Un
widget sin entitlement se muestra bloqueado y **no se consulta**. Layout
personal: ocultar, mover, tamaño, restaurar, volver al recomendado
(`POST /api/preferences/dashboard`). Un layout guardado no se reescribe si el
preset cambia.

## Onboarding y checklist

- `/bienvenida` (5 preguntas) → `POST /api/workspace/setup`: guarda perfil,
  aplica preset y marca `onboardingCompletedAt`. Solo OWNER/ADMIN.
- Onboarding pendiente + MEMBER: entra normal con preset GENERAL/deducido,
  trabaja, ve el aviso "un owner o admin puede configurarlo" **sin CTA**. En el
  checklist, "Configura tu negocio" aparece sin enlace y no cuenta como
  pendiente suya. Ninguna ruta redirige a /bienvenida (test estático).
- Checklist derivado del preset; avance calculado del estado real; estados
  `completed / available / locked / notRelevant` (+ `roleRestricted`). Lo
  bloqueado por plan no es obligatorio.
- `invite_team` existe pero ningún preset la usa: no hay pantalla de equipo
  dentro del workspace todavía.

## Cambio de perfil vs. aplicar preset

- Guardar el tipo de negocio (`PATCH /api/onboarding/profile`) no toca el
  preset ni las preferencias de nadie.
- "Aplicar navegación recomendada" (`POST /api/workspace/preset`, OWNER/ADMIN)
  fija el preset recomendado y resetea solo el layout de quien lo aplica.

## Tutoriales

`pipeline/automation/products/inbox.first_visit`, descartables por usuario ×
workspace; "Volver a mostrar consejos" en Configuración → Menú e inicio.

## Platform

`/platform/workspaces/[id]` muestra tipo, subtipo y preset (solo lectura). Al
aprovisionar un **negocio interno** (SUPER_ADMIN) se puede elegir el tipo
inicial; para clientes SaaS se rechaza.

## Tests

`test:presets` (24), `smoke-p0e` (52, incluye rol server-side y MEMBER con
onboarding pendiente). Producción: aplicar migraciones de P0-D y P0-E antes del
deploy.

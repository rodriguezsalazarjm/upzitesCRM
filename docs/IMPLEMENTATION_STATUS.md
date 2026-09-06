# IMPLEMENTATION_STATUS — CRM Upzites beta SaaS

Seguimiento de la ejecucion de `ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md` (v1.0, 6-sep-2026).
Este archivo se actualiza al cierre de cada fase. No reemplaza a `contexto.md`.

- **Fase actual:** 0 — Proteccion y linea base
- **Estado:** inspeccion y verificacion completadas; respaldo (commit) PENDIENTE de aprobacion del propietario
- **Ultima actualizacion:** 2026-09-06

---

## 1. Checklist de fases

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Proteccion y linea base | En curso — falta el commit de respaldo |
| 1 | Dominio comercial y consentimiento | No iniciada |
| 2 | WhatsApp e Inbox humano | No iniciada |
| 3 | Cola, scheduler y automatizaciones reales | No iniciada |
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
| Inspeccion del monorepo, `apps/crm`, Prisma, migraciones, env, Vercel | Hecho | Seccion 2 y 3 |
| `git status` y clasificacion de cambios sin commit | Hecho | Seccion 3 |
| Lectura de instrucciones locales (`AGENTS.md`, `CLAUDE.md`, README) | Hecho | No existen `AGENTS.md` ni `CLAUDE.md`; solo `README.md` y `contexto.md` |
| Build de produccion registrado | Hecho | Seccion 4 |
| Lint y typecheck base registrados | Hecho | Seccion 4 |
| Inventario de rutas, tablas, migraciones y variables | Hecho | Seccion 2 |
| Config faltante de Mercado Pago documentada | Hecho | Seccion 5 |
| `docs/IMPLEMENTATION_STATUS.md` | Hecho | Este archivo |
| Plan de migraciones | Hecho | Seccion 7 |
| Commit de respaldo del estado actual | **Pendiente** | Requiere aprobacion del propietario (seccion 8) |
| Pruebas funcionales (login, CRUD, captura, webhook MP, aislamiento tenant) | **Bloqueado** | Sin base de datos disponible (seccion 5) |

**Criterio de salida de la Fase 0:** el estado actual puede restaurarse y desplegarse de forma reproducible.
**Aun no se cumple:** falta el commit de respaldo y una base de datos operativa.

---

## 2. Inventario de la linea base

### Stack verificado

Next.js 16.0 (App Router, React 19), Prisma 7.8 + `@prisma/adapter-pg`, PostgreSQL/Supabase,
Tailwind 4, Radix, Zod 3, TanStack Query, Zustand. Node v25.9.0, pnpm 11.3.0.
Despliegue: proyecto Vercel `upzites-crm` (`prj_o89p2u9wo254GTHfkvv8MQmzxedH`).

### Modelos Prisma (18)

`Workspace`, `User`, `PasswordResetToken`, `Company`, `Contact`, `PipelineStage`, `Opportunity`,
`Activity`, `LeadSource`, `Form`, `FormSubmission`, `WebEvent`, `Integration`, `AutomationRule`,
`AiInsight`, `SubscriptionPlan`, `WorkspaceSubscription`, `AuditLog`.

### Enums existentes (13)

`UserRole`, `ContactStatus`, `OpportunityStage`, `OpportunityStatus`, `ActivityType`, `WebEventType`,
`IntegrationProvider`, `IntegrationStatus`, `AutomationTrigger`, `AutomationAction`, `AiInsightType`,
`InsightStatus`, `SubscriptionStatus`.

### Migraciones (6)

```
20260614171000_init_crm
20260614182000_auth_workspaces
20260614190000_web_capture
20260614200000_integrations_ai_billing_ops
20260630220000_contact_owner            <- sin commit
20260630220100_billing_mercadopago      <- sin commit
```

### Rutas API (26 handlers)

Auth: `login`, `logout`, `me`, `register`, `password-reset`.
CRM: `contacts` (+`[id]`, `import`, `export`), `opportunities` (+`[id]`), `activities` (+`[id]`),
`pipeline-stages` (+`[id]`), `integrations`.
Captura publica: `capture/events`, `capture/forms/[publicId]`, `capture/forms/[publicId]/submit`,
`capture/snippet`.
Comercial/ops: `billing/checkout`, `billing/webhook`, `ai/insights/generate`, `automations/run`,
`system/health`.

### Paginas (11 secciones)

`dashboard`, `contactos` (+ficha +nuevo), `oportunidades` (+nueva), `actividades`, `fuentes`,
`integraciones`, `automatizaciones`, `insights`, `billing`, `ops`, `configuracion`,
mas `login` y `register`.

### Variables de entorno actuales

Obligatorias en produccion (validadas en `src/lib/env.ts` via `instrumentation.ts`):
`DATABASE_URL`, `DIRECT_URL`, `CRM_SESSION_SECRET` (min. 16 chars), `NEXT_PUBLIC_CRM_BASE_URL`.
Opcionales (solo advertencia, el checkout responde 503 sin ellas):
`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`.

---

## 3. Trabajo sin commit (riesgo #1)

`git status` reporta **99 entradas** sin proteger sobre `master` (HEAD `418a1c1`).

### CRM (`apps/crm`)

- 22 archivos modificados: `schema.prisma`, `lib/auth.ts`, layout del dashboard, pagina de billing y
  login, y 14 rutas API.
- 15 rutas/archivos sin trackear: registro (`(auth)/register`, `api/auth/register`),
  `api/billing/webhook`, `components/billing/`, `lib/env.ts`, `lib/http.ts`, `lib/mercado-pago.ts`,
  `lib/subscription.ts`, `instrumentation.ts`, `vercel.json`, `prisma/seed-alvaro.ts`
  y las 2 migraciones nuevas.

### Web (`apps/web`)

- 20 archivos modificados y ~20 sin trackear: seccion `/blog` completa, `/soluciones/*`,
  `robots.ts`, `sitemap.ts`, `lib/resend.ts`, `lib/blog.ts`, `proxy.ts`, componentes nuevos y assets.

### Otros

- `docs/contexto/`, `scripts/convert-landing.mjs`, `our-work-prototype-v3-bebas/` (3.1 MB),
  `.vercelignore`, cambios en `contexto.md`, `package.json`, `pnpm-lock.yaml`.
- `Soluciones/` pesa **1.2 GB** (1.2 GB solo en `02reels24h`, videos `.mp4`).
  **No debe entrar al repositorio.** Ya esta excluido de Vercel via `.vercelignore`,
  pero NO de git. Ver seccion 8.

### Secretos

`apps/crm/.env` y `apps/crm/.env.production.local` estan correctamente ignorados por
`apps/crm/.gitignore`. Ningun `.env` real esta trackeado (`git ls-files` solo devuelve `.env.example`).

### Stash existente

`stash@{0}: On master: PROYECTOS effect + reorder + remove audit (revertido a peticion del usuario)`.
No se toca.

---

## 4. Verificacion de la linea base

Ejecutado el 2026-09-06 sobre el working tree actual (sin modificar nada):

| Comando | Resultado |
|---|---|
| `pnpm --filter @upzites/crm build` | **OK** (exit 0). 40 rutas generadas |
| `pnpm --filter @upzites/crm lint` | **OK** (0 errores, 2 warnings) |
| `pnpm --filter @upzites/crm exec tsc --noEmit` | **OK** (0 errores) |
| `pnpm --filter @upzites/web build` | **OK** (exit 0) |

### Errores preexistentes registrados

1. `postcss.config.js:1` — warning `import/no-anonymous-default-export`.
2. `tailwind.config.js:2` — warning `import/no-anonymous-default-export`.

No hay errores de compilacion ni de tipos preexistentes. No hay suite de tests en el repositorio.

---

## 5. Bloqueadores abiertos

### B1 — Base de datos de produccion inalcanzable (critico)

`apps/crm/.env.production.local` apunta al proyecto Supabase `qvuneqedhhnkfgvdzmjj`
(`aws-1-us-west-2.pooler.supabase.com`). `prisma migrate status` falla en ambos puertos:

```
FATAL: (ENOTFOUND) tenant/user postgres.qvuneqedhhnkfgvdzmjj not found
```

El DNS del pooler resuelve correctamente, por lo que no es un problema de red: el proyecto
esta eliminado, pausado o el ref/credenciales cambiaron. **No se puede confirmar que las 6
migraciones esten aplicadas en produccion ni que el CRM este desplegable hoy.**

### B2 — Sin base de datos local

`apps/crm/.env` apunta a `localhost:5433` (el `docker-compose.yml` del repo) y no responde.
Docker no esta disponible en el PATH de esta maquina. Esto bloquea todas las pruebas
funcionales de la Fase 0 (login, registro, CRUD de contacto, captura de formulario,
webhook de Mercado Pago con fixtures, aislamiento entre dos workspaces).

### B3 — Mercado Pago sin configurar

`MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` no estan en `apps/crm/.env`
ni en `.env.production.local`. El arranque no se bloquea (por diseno), pero
`POST /api/billing/checkout` responde 503 y el webhook responde 500. El cobro de la
suscripcion no funciona en ningun entorno hoy.

### B4 — Trabajo sin commit

99 entradas sin proteger. Un `git checkout`, `reset` o un cambio de rama accidental
destruye semanas de trabajo de web y CRM. Es el bloqueador que la especificacion marca
como riesgo numero uno.

---

## 6. Deuda tecnica identificada en la linea base

| # | Item | Impacto |
|---|---|---|
| D1 | Sin rate limiting en `/api/auth/login` ni en la captura publica (CORS `*`) | Seccion 15 de la spec lo exige antes de beta publica |
| D2 | Sin suite de tests (unitarios, integracion o E2E) | Toda fase exige pruebas |
| D3 | Sin pruebas de aislamiento entre workspaces | Exigido por la spec (seccion 15) |
| D4 | Sin cifrado de tokens de integracion (`Integration.config` es JSON plano) | Requerido para WhatsApp/Shopify (Fase 2 y 6) |
| D5 | Sin cola durable ni scheduler; `automations/run` e `insights/generate` son endpoints manuales | Fase 3 los reemplaza |
| D6 | La regla de automatizacion esta hardcodeada; `trigger`/`action`/`conditions` no se ejecutan | Fase 3 |
| D7 | "Insights IA" es scoring heuristico determinista, sin LLM | Fase 4 |
| D8 | 7 de 9 proveedores de `Integration` son solo estado en BD, sin OAuth ni sync | Fases 2, 6 y 8 |
| D9 | `ContactStatus` mezcla ciclo de vida con intencion; la spec exige dimensiones separadas | Fase 1 |
| D10 | Fallback demo (`admin@upzites.cl` / `demo1234`) activo cuando `NODE_ENV !== production` | Acotado, pero revisar antes de pilotos |
| D11 | Formulario de perfil del workspace en `/configuracion` es `readOnly` con boton deshabilitado | Fase 9 (onboarding) |
| D12 | Sin `AGENTS.md` ni `CLAUDE.md` en el repositorio | Conviene crearlos al cerrar Fase 0 |

---

## 7. Plan de migraciones

Principios acordados con la especificacion:

1. Una migracion por fase, nunca una migracion monolitica.
2. Toda columna nueva sobre tablas con datos entra como nullable o con default.
3. Renombres se hacen en dos pasos (agregar + backfill + dejar de leer, luego eliminar en
   una migracion posterior), nunca destructivos en el mismo despliegue.
4. Antes de cada `migrate deploy` se verifica `migrate status` y se toma respaldo Supabase.
5. Cada migracion documenta aqui su procedimiento de reversion.

Estado de partida: las migraciones `20260630220000_contact_owner` y
`20260630220100_billing_mercadopago` existen en disco pero **no estan commiteadas ni
verificadas contra produccion** (ver B1).

---

## 8. Tareas manuales del propietario

| # | Tarea | Por que |
|---|---|---|
| T1 | Aprobar el commit de respaldo y decidir rama destino | La spec exige commit aprobado antes de tocar codigo |
| T2 | Decidir el destino de `Soluciones/` (1.2 GB) — recomendado: agregar `/Soluciones/` a `.gitignore` y respaldar aparte | Git no debe versionar 1.2 GB de video |
| T3 | Restaurar o recrear el proyecto Supabase y entregar `DATABASE_URL` / `DIRECT_URL` validos | Desbloquea B1, B2 y todas las pruebas |
| T4 | Entregar `MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` (TEST primero) | Desbloquea B3 |
| T5 | Confirmar variables de entorno del proyecto Vercel `upzites-crm` | Verificar que el deploy base es reproducible |
| T6 | Confirmar el email real de Alvaro Quintero antes de correr `seed-alvaro.ts` | El seed trae un default provisional |

---

## 9. Variables de entorno pendientes

Ninguna variable nueva se ha introducido todavia. Las siguientes se necesitaran en fases
posteriores (nombres tentativos, se fijaran al implementar cada fase):

| Variable | Fase | Obligatoria para |
|---|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | 0 / 5 | Cobro de suscripcion y de productos |
| `INTEGRATION_ENCRYPTION_KEY` | 1 | Cifrado de tokens de integracion |
| `INTERNAL_WORKER_SECRET` | 3 | Proteger los endpoints `/api/internal/*` |
| `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | 2 | WhatsApp Cloud API |
| `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_DEFAULT_MODEL` | 4 | Agentes IA |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES` | 6 | Shopify |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET` | 8 | Email marketing |

`src/lib/env.ts` debera distinguir variables obligatorias para arrancar de variables que solo
habilitan una integracion (una integracion sin configurar aparece inactiva, no tumba el CRM).

---

## 10. Decisiones registradas

| Fecha | Decision |
|---|---|
| 2026-09-06 | Se adopta `ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md` v1.0 como fuente de verdad funcional y tecnica de la beta |
| 2026-09-06 | El CRM existente se evoluciona, no se reescribe. Auth, multi-tenancy, captura web, pipeline y Mercado Pago se preservan |
| 2026-09-06 | Fase 0 no avanza a Fase 1 sin aprobacion explicita del propietario |

---

## 11. Bitacora

### 2026-09-06 — Fase 0

- Inspeccion completa del monorepo y de `apps/crm` (18 modelos, 6 migraciones, 26 rutas API, 13 paginas).
- Verificacion de linea base: build CRM OK, build web OK, lint 0 errores / 2 warnings, `tsc` 0 errores.
- Detectado B1: el proyecto Supabase de produccion no responde (`tenant/user not found`).
- Detectado B2: sin base de datos local (Docker no disponible).
- Confirmado que ningun `.env` con secretos esta trackeado en git.
- Detectado `Soluciones/` con 1.2 GB sin trackear ni ignorar por git.
- Creado este archivo.
- **Pendiente para cerrar la fase:** commit de respaldo aprobado + base de datos operativa
  para ejecutar las pruebas funcionales.

# Deploy Upzites en Vercel + Supabase

La infraestructura objetivo es:

- Vercel para `apps/web`, el sitio publico.
- Vercel para `apps/crm`, el CRM interno/comercial.
- Supabase Postgres como base de datos productiva del CRM.
- Prisma para migraciones, seed y acceso a datos.

## Fase 0: Preflight local

Antes de tocar produccion:

```bash
pnpm install
pnpm --filter @upzites/web build
pnpm --filter @upzites/crm build
pnpm lint
```

Confirmar tambien:

- `apps/web` corre local en `http://localhost:3000`.
- `apps/crm` corre local en `http://localhost:3001`.
- No hay secretos reales commiteados en `.env`, `.env.local` ni documentos.
- Las variables locales salen desde `apps/web/.env.example` y `apps/crm/.env.example`.

## Fase 1: Supabase

Crear un proyecto Supabase para produccion y guardar:

- Project ref.
- Region.
- Password de Postgres.
- Pooler URL.
- Direct connection URL.

Variables necesarias para `apps/crm`:

```bash
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
CRM_SESSION_SECRET="un-secreto-largo-y-unico"
NEXT_PUBLIC_CRM_BASE_URL="https://crm.tudominio.cl"
```

Uso esperado:

- `DATABASE_URL`: runtime de Next/Prisma en Vercel usando el pooler de Supabase.
- `DIRECT_URL`: Prisma CLI para `migrate deploy` y `seed`.
- `CRM_SESSION_SECRET`: secreto largo, unico y distinto al de local.
- `NEXT_PUBLIC_CRM_BASE_URL`: URL publica final del CRM.

## Fase 2: Migraciones y seed

Ejecutar desde local o CI con variables apuntando a Supabase produccion:

```bash
pnpm --filter @upzites/crm db:generate
pnpm --filter @upzites/crm db:deploy
pnpm --filter @upzites/crm db:seed
```

En produccion usar solo `prisma migrate deploy`. No usar `prisma migrate dev` contra Supabase productivo.

Verificar despues:

```bash
pnpm --filter @upzites/crm db:generate
```

Y revisar en Supabase Table Editor que existan tablas como `Workspace`, `User`, `Contact`, `Form`, `FormSubmission` y `WebEvent`.

## Fase 3: Vercel web

Crear proyecto `upzites-web`:

- Framework: Next.js.
- Root directory: `apps/web`.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm build`.
- Development command: `pnpm dev`.

Variables para produccion:

```bash
NEXT_PUBLIC_PAGESPEED_KEY=""
NEXT_PUBLIC_META_PIXEL_ID=""
NEXT_PUBLIC_META_PIXEL_IDS=""
NEXT_PUBLIC_META_PIXEL_REQUIRE_CONSENT="false"
NEXT_PUBLIC_CRM_BASE_URL="https://crm.tudominio.cl"
CRM_CAPTURE_FORM_PUBLIC_ID=""
CRM_PUBLIC_KEY=""
```

Cuando el CRM ya este online, llenar `CRM_CAPTURE_FORM_PUBLIC_ID` y `CRM_PUBLIC_KEY` con los valores reales generados/definidos en el CRM para que formularios y tracking sincronicen leads.

## Fase 4: Vercel CRM

Crear proyecto `upzites-crm`:

- Framework: Next.js.
- Root directory: `apps/crm`.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm build`.
- Development command: `pnpm dev`.

Variables para produccion:

```bash
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
CRM_SESSION_SECRET="un-secreto-largo-y-unico"
NEXT_PUBLIC_CRM_BASE_URL="https://crm.tudominio.cl"
```

Despues del primer deploy, probar:

- `https://crm.tudominio.cl/api/system/health`
- Login del CRM.
- Creacion/edicion de contactos.
- Captura de formularios desde el sitio publico.

## Fase 5: Dominio y DNS

Estructura recomendada:

- `tudominio.cl` y `www.tudominio.cl` apuntan a `upzites-web`.
- `crm.tudominio.cl` apunta a `upzites-crm`.

En Vercel:

1. Agregar dominio principal al proyecto `upzites-web`.
2. Agregar `www` y elegir dominio canonico.
3. Agregar `crm.tudominio.cl` al proyecto `upzites-crm`.
4. Copiar los registros DNS que entrega Vercel en el proveedor del dominio.
5. Esperar verificacion SSL.

Cuando el DNS quede activo, actualizar:

- `NEXT_PUBLIC_CRM_BASE_URL` en `upzites-web`.
- `NEXT_PUBLIC_CRM_BASE_URL` en `upzites-crm`.
- Cualquier referrer permitido de `NEXT_PUBLIC_PAGESPEED_KEY`, si se usa.

## Fase 6: Verificacion final

Checklist de go-live:

- Sitio publico carga desde dominio final.
- CRM carga desde subdominio final.
- SSL activo en ambos dominios.
- `/api/system/health` del CRM responde correctamente.
- Formularios del sitio crean registros en Supabase.
- Eventos web llegan a `WebEvent`.
- Login/logout funcionan con cookie segura en produccion.
- No aparecen errores criticos en Vercel Runtime Logs.
- Supabase muestra conexiones sanas y sin saturacion.

## Rollback

Si falla el deploy de frontend:

- Usar Vercel Deployments y promover el deployment anterior.

Si falla una migracion:

- No ejecutar cambios manuales improvisados en produccion.
- Revisar la migracion fallida en Supabase logs.
- Corregir en una nueva migracion Prisma y volver a correr `db:deploy`.

## Notas tecnicas

- Docker queda solo como alternativa local opcional.
- Supabase Auth no se usa todavia; el CRM mantiene auth propia con cookies HTTP-only y usuarios en Postgres.
- Si luego se decide migrar a Supabase Auth, los modelos actuales de usuarios y membresias deben adaptarse alrededor de `auth.users`.

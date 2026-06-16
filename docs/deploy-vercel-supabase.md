# Deploy Upzites en Vercel + Supabase

La infraestructura oficial del proyecto es:

- Vercel para `apps/web`.
- Vercel para `apps/crm`.
- Supabase Postgres como base de datos del CRM.
- Prisma como capa de migraciones y acceso a datos.

## Proyectos en Vercel

Crear dos proyectos:

1. `upzites-web`
   - Root directory: `apps/web`
   - Build command: `pnpm build`
   - Development command: `pnpm dev`

2. `upzites-crm`
   - Root directory: `apps/crm`
   - Build command: `pnpm build`
   - Development command: `pnpm dev`

## Supabase

Crear un proyecto Supabase y usar Postgres como base principal del CRM.

Variables necesarias para `apps/crm` en Vercel:

```bash
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
CRM_SESSION_SECRET="un-secreto-largo-y-unico"
NEXT_PUBLIC_CRM_BASE_URL="https://crm.tudominio.cl"
```

Uso recomendado:

- `DATABASE_URL`: runtime en Vercel usando pooler de Supabase.
- `DIRECT_URL`: Prisma CLI para migraciones y seed.

## Migraciones

Desde local o CI, con variables apuntando a Supabase:

```bash
pnpm install
pnpm --filter @upzites/crm db:generate
pnpm --filter @upzites/crm db:deploy
pnpm --filter @upzites/crm db:seed
```

En produccion no usar `prisma migrate dev`; usar `prisma migrate deploy`.

## Dominios

Recomendado:

- `upzites.cl` o `www.upzites.cl` para `apps/web`.
- `crm.upzites.cl` para `apps/crm`.

Actualizar `NEXT_PUBLIC_CRM_BASE_URL` con el dominio final del CRM para que el snippet y los formularios embebibles generen URLs correctas.

## Notas

- Docker queda solo como alternativa local opcional.
- Supabase Auth no se usa todavia; el CRM mantiene auth propia con cookies HTTP-only y usuarios en Postgres.
- Si luego se decide migrar a Supabase Auth, los modelos actuales de `users` y `workspace_members` deberian adaptarse alrededor de `auth.users`.

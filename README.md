# Upzites Monorepo

Monorepo para el sitio publico de Upzites y el CRM interno/comercial.

## Apps

- `apps/web`: sitio principal de Upzites. Corre en `http://localhost:3000`.
- `apps/crm`: frontend del CRM. Corre en `http://localhost:3001`.
- `docs/crm-legacy`: referencia historica del backend/arquitectura CRM.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.
- Cuenta Supabase para la base de datos del CRM.
- Cuenta Vercel para deploy de `web` y `crm`.

## Comandos

```bash
pnpm install
pnpm dev:web
pnpm dev:crm
pnpm build
pnpm lint
```

## Base de datos del CRM

El CRM usa Supabase Postgres con Prisma.

Configura `apps/crm/.env` a partir de `apps/crm/.env.example`:

- `DATABASE_URL`: URL del pooler de Supabase para runtime/Vercel.
- `DIRECT_URL`: URL directa de Supabase para migraciones y seed.

```bash
pnpm --filter @upzites/crm db:generate
pnpm --filter @upzites/crm db:deploy
pnpm --filter @upzites/crm db:seed
pnpm dev:crm
```

Para desarrollo local con Docker todavia existe `pnpm db:crm:up`, pero no es la infraestructura objetivo.

## Deploy

La infraestructura objetivo vive en [docs/deploy-vercel-supabase.md](docs/deploy-vercel-supabase.md).

- `apps/web` se despliega como proyecto Vercel independiente.
- `apps/crm` se despliega como proyecto Vercel independiente.
- Supabase Postgres es la base de datos compartida por el CRM.

## Desarrollo

Para trabajar solo en el sitio publico:

```bash
pnpm --filter @upzites/web dev
```

Para trabajar solo en el CRM:

```bash
pnpm --filter @upzites/crm dev
```

## Plan del CRM

Todo el contexto, plan por fases, vision de producto y actualizacion de la web
vive consolidado en `contexto.md` (incluye Anexo A: producto/arquitectura y
Anexo B: web/servicios). Es el documento maestro unico.

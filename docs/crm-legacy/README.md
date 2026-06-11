# CRM Upzites 🚀

CRM web-first para crecimiento comercial de pymes chilenas. Diseñado para empresas que ya tienen un sitio web y necesitan capturar leads, conversar, agendar, cotizar, cobrar y medir atribución de ingresos.

## Stack Tecnológico

### Backend
- **Node.js 24 LTS** - Runtime
- **NestJS + Fastify** - Framework y servidor
- **PostgreSQL 18 + pgvector** - Base de datos transaccional + embeddings
- **Drizzle ORM** - Acceso a datos type-safe
- **Zod** - Validación de schemas
- **OpenTelemetry** - Observabilidad

### Frontend
- **Next.js 16** - Framework React
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Estilos
- **shadcn/ui** - Componentes accesibles
- **TanStack Query** - State management
- **Zod** - Validación de datos

## Setup Rápido

### Requisitos
- **Node.js 24.11.0+** (usa `.nvmrc`)
- **pnpm 8.0.0+** ([instalar aquí](https://pnpm.io/installation))
- **Docker + Docker Compose** (para PostgreSQL)

### Instalación

```bash
# 1. Clonar/descargar el repo
cd crmupzites

# 2. Instalar dependencias (desde la raíz)
pnpm install

# 3. Levantar PostgreSQL
pnpm run docker:up

# 4. Ejecutar migraciones del backend
pnpm --filter @crm/backend run db:migrate

# 5. Iniciar dev servers (backend + frontend)
pnpm run dev
```

Eso es todo. Los servidores estarán en:
- **Backend:** http://localhost:3001
- **Frontend:** http://localhost:3000

## Estructura del Proyecto

```
crmupzites/
├── apps/
│   ├── backend/       # NestJS + PostgreSQL + Drizzle
│   └── frontend/      # Next.js + React 19 + shadcn/ui
├── docs/              # Documentación
├── docker-compose.yml # PostgreSQL + pgvector
├── package.json       # Workspace root
└── pnpm-workspace.yaml
```

## Desarrollo

### Scripts Disponibles

```bash
# Desarrollo
pnpm run dev              # Levanta backend + frontend
pnpm run build            # Construye ambas apps
pnpm run lint             # Verifica código
pnpm run format           # Formatea código

# Docker
pnpm run docker:up        # Levanta PostgreSQL
pnpm run docker:down      # Para PostgreSQL
pnpm run docker:logs      # Ver logs de PostgreSQL

# Backend
pnpm --filter @crm/backend run start:dev
pnpm --filter @crm/backend run db:migrate
pnpm --filter @crm/backend run db:seed

# Frontend
pnpm --filter @crm/frontend run dev
pnpm --filter @crm/frontend run build
```

## Documentación

- [Guía de contribución](docs/CONTRIBUTING.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [API Documentation](apps/backend/docs/api.md) (auto-generada)

## Variables de Entorno

Copia `.env.example` a `.env` en la raíz:

```bash
# Backend
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_dev
NODE_ENV=development
PORT=3001

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Licencia

Privado - Upzites 2026

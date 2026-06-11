# Arquitectura del CRM Upzites

## Visión General

El CRM Upzites es una aplicación modular con tres dominios lógicos principales:

```
┌─────────────────────────────────────────────┐
│         Frontend (Next.js + React)          │
│  Dashboard, Forms, Pages, Real-time UI      │
└────────────────────┬────────────────────────┘
                     │ REST API + OpenAPI
┌────────────────────▼────────────────────────┐
│   Backend Transaccional (NestJS + Fastify) │
│   Auth, Contacts, Opportunities, Webhooks   │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼──┐  ┌─────▼──┐  ┌──────▼──┐
   │PostgreSQL│ Temporal  │ClickHouse│
   │+ pgvector│ (async) │ (analytics)│
   └─────────┘ └───────┘ └──────────┘
```

## Módulos Backend

### 1. **Auth Module** (`src/modules/auth/`)
Maneja autenticación y autorización:
- Login / Register
- JWT tokens
- Row-Level Security (RLS) en PostgreSQL
- OAuth (futuro)

### 2. **Contacts Module** (`src/modules/contacts/`)
Gestión de contactos y empresas:
- CRUD de contactos
- Propiedades customizables
- Integración con webhooks
- Búsqueda y filtrado

### 3. **Opportunities Module** (`src/modules/opportunities/`)
Pipeline de ventas:
- Creación y seguimiento de oportunidades
- Movimiento entre etapas
- Asignación a vendedores
- Cierre y análisis

### 4. **Webhooks Module** (`src/modules/webhooks/`)
Integración con sitios web:
- Recepción de eventos desde snippet universal
- Sincronización de formularios
- Tracking de visitas y eventos

### 5. **Integrations Module** (`src/modules/integrations/`)
Conexiones externas:
- WhatsApp Business API
- Google Workspace (Gmail, Calendar)
- Transbank / Mercado Pago / Khipu
- WooCommerce, Shopify (futuro)

## Capa de Datos

### PostgreSQL 18 + Drizzle ORM

**Tablas principales:**
```
users (autenticación + perfil)
contacts (leads y clientes)
companies (empresas)
opportunities (ventas)
activities (notas, calls, emails)
webhooks (eventos del sitio)
integrations (credenciales de terceros)
```

**Row-Level Security (RLS):**
- Cada fila de datos pertenece a un workspace
- SQL policies aislan acceso por usuario y workspace
- El backend no almacena secretos, usa tokens

### pgvector
- Almacena embeddings de descripciones
- Permite búsqueda semántica en notas
- Soporte para IA/LLM (futuro)

## Integración Frontend-Backend

### REST API + OpenAPI
- Endpoints RESTful estándar
- OpenAPI spec auto-generada
- Cliente TypeScript generado automáticamente

**Estructura de endpoints:**
```
/api/v1/
├── auth/
│   ├── POST /login
│   ├── POST /register
│   └── POST /logout
├── contacts/
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   └── PUT /:id
├── opportunities/
│   ├── GET /
│   ├── POST /
│   └── PUT /:id/stage
└── webhooks/
    └── POST / (recibe eventos)
```

## Frontend Architecture

### App Router (Next.js 16)
```
app/
├── (public)/           # Sin autenticación
│   ├── layout.tsx
│   ├── page.tsx        # Landing
│   └── login/
├── (dashboard)/        # Con autenticación
│   ├── layout.tsx      # Sidebar + header
│   ├── page.tsx        # Dashboard principal
│   ├── contacts/
│   ├── opportunities/
│   └── settings/
```

### State Management
- **TanStack Query:** Server state (datos de API)
- **React Context:** Autenticación global
- **URL state:** Filtros, paginación

### Componentes
- **shadcn/ui:** Base de componentes accesibles
- **Custom:** Componentes específicos del dominio

## Flujo de Datos

### Captura Web
```
1. Snippet universal insertado en sitio cliente
2. Detecta visitas, formularios, clics
3. Envía eventos a /api/webhooks/
4. Backend: almacena en BD + envía a ClickHouse
5. Frontend: refleja en tiempo real (WebSocket futuro)
```

### Lead → Conversión
```
1. Contacto entra por formulario/visita
2. Sistema asigna automáticamente (scoring, reglas)
3. Vendedor notificado
4. Conversación: chat, email, WhatsApp unificados
5. Cotización → Pago → Cierre
6. Atribución: qué página → ventas reales
```

## Performance y Escalabilidad

### Bases de Datos Separadas
- **PostgreSQL:** Transaccional, normalizad
- **ClickHouse:** Analítica, eventos, atribución
- Replicación asincrónica mediante Temporal

### Caching
- Redis (futuro): sesiones, caché de consultas
- Next.js: Static Generation + ISR

### Async Jobs (Temporal)
- Secuencias de seguimiento
- Notificaciones
- Integraciones externas
- Reportes programados

## Seguridad

- **JWT:** Stateless auth
- **RLS en PostgreSQL:** Control granular por fila
- **Zod:** Validación strict de input
- **HTTPS:** Comunicación encriptada
- **API Keys:** Para integraciones externas
- **Rate limiting:** Protección DDoS

## Monitoreo y Observabilidad

### OpenTelemetry
- **Traces:** Seguimiento de requests end-to-end
- **Metrics:** Performance, latencia, errores
- **Logs:** Centralizados y estructurados

### Herramientas
- Jaeger (traces)
- Prometheus (métricas)
- ELK Stack o DataDog (logs)

## Roadmap Futuro

### Fase 2
- Scoring automático de leads
- IA para resúmenes de conversaciones
- Formularios inteligentes
- Nurturing automático

### Fase 3
- Marketplace de integraciones
- Webhooks customizables
- Agentes IA para seguimiento
- Mobile app (React Native)

---

**Última actualización:** Mayo 2026

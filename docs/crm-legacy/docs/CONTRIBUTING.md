# Guía de Contribución

## Setup Local

1. **Clonar el repo**
   ```bash
   git clone <repo-url>
   cd crmupzites
   ```

2. **Instalar Node.js 24**
   ```bash
   # Usando nvm
   nvm use  # Lee .nvmrc automáticamente
   
   # O descargarlo manualmente desde nodejs.org
   ```

3. **Instalar pnpm**
   ```bash
   npm install -g pnpm@latest
   ```

4. **Instalar dependencias**
   ```bash
   pnpm install
   ```

5. **Levantar PostgreSQL**
   ```bash
   pnpm run docker:up
   ```

6. **Ejecutar migraciones**
   ```bash
   pnpm --filter @crm/backend run db:migrate
   ```

7. **Iniciar desarrollo**
   ```bash
   pnpm run dev
   ```

## Convenciones de Código

### TypeScript
- Usa tipos explícitos siempre que sea posible
- Evita `any`
- Usa `readonly` para objetos inmutables

### Commits
```bash
# Usa convenciones de Conventional Commits
git commit -m "feat: agregar módulo de contactos"
git commit -m "fix: corregir validación de email"
git commit -m "docs: actualizar README"
```

Formatos válidos:
- `feat:` - Nueva característica
- `fix:` - Bug fix
- `docs:` - Documentación
- `style:` - Cambios de formato (no afectan funcionalidad)
- `refactor:` - Refactorización
- `perf:` - Mejora de performance
- `test:` - Tests
- `chore:` - Cambios build/dependencias

### Branches
```bash
# Usa nombres descriptivos
git checkout -b feat/agregar-api-contactos
git checkout -b fix/validacion-email
git checkout -b docs/actualizar-readme
```

## Estructura de Carpetas

### Backend (`apps/backend/`)
```
src/
├── modules/        # Módulos de negocio (auth, contacts, etc)
├── common/         # Compartido (guards, filters, decorators)
├── database/       # Esquemas Drizzle, migraciones
└── config/         # Configuración centralizada
```

### Frontend (`apps/frontend/`)
```
src/
├── app/           # Next.js app directory
├── components/    # Componentes reutilizables
├── hooks/         # Custom hooks
├── lib/           # Utilidades
└── types/         # TypeScript types
```

## Requisitos antes de Commit

```bash
# 1. Lintear código
pnpm run lint

# 2. Formatear código
pnpm run format

# 3. Ejecutar tests
pnpm run test

# 4. Verificar tipos TypeScript
pnpm run type-check
```

## Flujo de PR

1. Crear una rama desde `main`
2. Hacer cambios
3. Pasar linting, tests y type-checking
4. Crear pull request con descripción clara
5. Esperar review
6. Mergear cuando esté aprobado

## Preguntas?

- Crea una issue en GitHub
- Contacta al equipo en el canal #engineering de Slack

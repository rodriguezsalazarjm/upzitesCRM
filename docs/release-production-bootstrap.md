# Release a producción y bootstrap (Subscriptions V2)

Procedimiento para llevar a producción el bloque P0-A → P0-F (y lo que venga
detrás) sin dejar workspaces bloqueados. Nada de esto se ejecuta solo: cada
paso lo lanza una persona, y los scripts que escriben son dry-run por defecto.

## 0. Ensayo local (obligatorio antes de tocar producción)

1. Base local `crm_rehearsal` (127.0.0.1:5432) con el marcador de base aislada,
   migrada hasta el commit que hoy está en producción y con un seed sintético
   equivalente a los datos reales (mismos slugs, planes y estados; sin datos
   personales).
2. `prisma migrate deploy` con el commit a desplegar → sin drift ni pérdidas.
3. Bootstrap (paso 3) contra la base de ensayo, con `--apply --confirm-host 127.0.0.1`.
4. `next build` y levantar el build contra la base de ensayo:

   ```bash
   node scripts/rehearsal/start-server.mjs   # :3102, aborta si no es crm_rehearsal
   ```

5. Smokes contra la base de ensayo (`test:smoke:all`, `smoke-commerce-ledger.ts`)
   y recorrido manual: login, dashboard, canales, cobro.

Las credenciales del seed de ensayo viven fuera del repo (`.local-visual/`,
ignorado). Nunca se commitean.

## 1. Variables de entorno (Vercel, producción)

Antes de desplegar, comparar `apps/crm/.env.example` con Vercel. Sin estas, el
flujo afectado no funciona en producción:

- Email: `EMAIL_PROVIDER=RESEND`, `RESEND_API_KEY`, `PLATFORM_EMAIL_FROM`,
  `EMAIL_WEBHOOK_SECRET`. Sin proveedor real no sale ningún email
  (reset de contraseña, invitaciones, entregas digitales).
- Mercado Pago OAuth por workspace: `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`.
- Push: `VAPID_*`. Media: `MEDIA_STORAGE_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Migraciones

`prisma migrate deploy` contra producción justo antes del deploy. Revisar antes
con `prisma migrate status` qué migraciones quedan pendientes.

**Riesgo:** entre migrar y el bootstrap, los workspaces legacy quedan en FREE.
Si el job de salud de canales corre en esa ventana, los canales conectados pasan
a `planLimited`. El bootstrap (paso 3) va inmediatamente después y los libera.

## 3. Bootstrap

Desde `apps/crm`, con `DATABASE_URL` de producción. Ambos scripts imprimen
`Base: host/db` y son dry-run salvo `--apply --confirm-host <host exacto>`.

```bash
# Suscripciones: un --op por workspace (slug=[internal,]PLAN,FUENTE[,dias])
pnpm exec tsx scripts/subscription-admin.ts --op "<slug>=internal,SCALE,COMP" --reason "bootstrap produccion"
pnpm exec tsx scripts/subscription-admin.ts --op "<slug>=internal,SCALE,COMP" --reason "bootstrap produccion" --apply --confirm-host <host>

# Operador de plataforma
pnpm exec tsx scripts/platform-admin.ts grant <email> SUPER_ADMIN "bootstrap produccion"
pnpm exec tsx scripts/platform-admin.ts grant <email> SUPER_ADMIN "bootstrap produccion" --apply --confirm-host <host>
```

Detalle de `platform-admin.ts`: ver `docs/p0d-platform-admin.md`.

## 4. Verificación post-deploy

- `platform-admin.ts list` muestra al SUPER_ADMIN.
- Cada workspace del bootstrap resuelve el plan esperado (dry-run de
  `subscription-admin.ts` = "sin cambios").
- Canales que estaban conectados siguen `CONNECTED` y sin `planLimited`.
- Un pago de prueba de commerce crea `CustomerOrder`/`Payment` y nunca
  `SubscriptionPayment` (lo mismo que verifica `smoke-commerce-ledger.ts`).

## Rollback

Las migraciones son aditivas; el rollback es volver a desplegar el commit
anterior en Vercel. No revertir migraciones a mano.

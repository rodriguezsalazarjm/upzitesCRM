# P35 — Release a producción (P0 → P34)

- Objetivo: llevar `crm.upzites.com` de `ddbe857` a la punta de `feat/meta-ads-funnel-p34`.
- Diferencia: 71 commits y 25 migraciones (las 9 de Subscriptions V2 más las 16 de P2–P32).
- Procedimiento base: `docs/release-production-bootstrap.md`. Este documento suma lo de esta release.

## Ensayo (19-11-2026, local, OK)

La base `crm_rehearsal` refleja producción: las 32 migraciones de `ddbe857` más un seed sintético con los mismos slugs, planes y estados.

1. El 29-09 se ensayaron las 9 migraciones de Subscriptions V2 y el bootstrap.
2. Hoy se respaldó la base como copia `crm_rehearsal_pre_p35` y se aplicaron las 16 restantes.

Resultados:
- `migrate deploy` OK y `migrate status` al día (57/57).
- Ninguna tabla perdió filas; hay 20 tablas nuevas.
- Diff contra el schema: solo 4 índices y 1 default creados a mano en SQL (búsqueda de conocimiento e índices de WhatsApp). crm_pruebas tiene lo mismo: es intencional, no hay drift.
- Smokes contra la base migrada: crítico 118/118, ledger 29/29, entrega digital 73/73, seguimientos 49/49, suscripciones/entitlements (p0c) 50/50.
- `next build` OK. Con el build arrancado contra la base migrada (`crm-rehearsal`, :3102), login de owner y 23 pantallas en 200; dashboard sin errores. Único aviso: email sin proveedor, que es lo esperado.
- Rollback ensayable: la copia `crm_rehearsal_pre_p35` queda como "backup".

## Antes de la ventana

1. **Credenciales de la base.** La contraseña de `C:\dev\upzites\apps\crm\.env` ya no autentica (19-11), probablemente porque se rotó.
   - Cargar la nueva con `scripts/set-crm-db.mjs`, que la codifica y la verifica.
   - Local: `sslmode=no-verify` en `DATABASE_URL`. Vercel: `sslmode=require`.
2. **Inventario real, solo lectura.**
   - `prisma migrate status` contra producción: se esperan 25 pendientes.
   - Listar los workspaces con su plan, para armar los `--op` del bootstrap.
3. **Cola de jobs (bloqueante).** El agente de IA (debounce de 3 s), los seguimientos, la postventa, la entrega y las publicaciones corren en jobs que solo avanzan cuando se llama a `POST /api/internal/run-jobs` con `INTERNAL_WORKER_SECRET`.
   - Confirmar que existe un llamado cada minuto.
   - Si no existe, en Supabase (gratis):
     ```sql
     create extension if not exists pg_cron; create extension if not exists pg_net;
     select cron.schedule('upzites-run-jobs', '* * * * *', $$
       select net.http_post(url := 'https://crm.upzites.com/api/internal/run-jobs',
         headers := jsonb_build_object('Content-Type','application/json','x-internal-secret','<INTERNAL_WORKER_SECRET>'),
         body := '{}'::jsonb) $$);
     ```
   - Antes, revisar en `src/lib/internal-auth.ts` el nombre exacto del header.
   - La alternativa es Vercel Pro con su cron por minuto.
4. **Variables en Vercel (`upzites-crm`, Production).**
   - Obligatorias, igual que antes: `DATABASE_URL`, `DIRECT_URL`, `CRM_SESSION_SECRET` y `NEXT_PUBLIC_CRM_BASE_URL`. La app no arranca sin ellas.
   - Para jobs: `INTERNAL_WORKER_SECRET`.
   - Opcionales nuevas desde `ddbe857`. Sin ellas, cada integración aparece inactiva pero no rompe el arranque:
     - IA real: `OPENAI_API_KEY`, `OPENAI_PROJECT_ID` y `OPENAI_DEFAULT_MODEL`.
     - Meta: `META_APP_ID`, `META_INSTAGRAM_APP_ID` y `META_INSTAGRAM_APP_SECRET`.
     - TikTok: `TIKTOK_APP_AUDITED`.
     - Buckets: `DELIVERY_STORAGE_BUCKET` y `KNOWLEDGE_STORAGE_BUCKET`. Hay que crear los buckets `deliverables` y `knowledge` en Supabase.
     - Email: `PLATFORM_EMAIL_FROM`.
     - OAuth de correo: `GOOGLE_OAUTH_*` y `MICROSOFT_OAUTH_*`.
   - Siguen faltando, desde septiembre: email (`EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET`), OAuth de Mercado Pago, `VAPID_*` y media de Supabase.

## Estado pre-ventana (20-11-2026)

- **Credenciales:** cargadas en `apps/crm/.env.production.local`.
  - Se reseteó la contraseña y Vercel se actualizó.
  - Caída de 00:49 a 01:08 UTC por el desfase entre el reset y Vercel.
- **Migraciones:** `migrate status` contra prod da exactamente las 25 pendientes esperadas.
- **Workspaces:** `upzites` (con 1 usuario) y `jose` / `jose-2` (cuentas smoketest).
- **Cola de jobs:** ya existe el cron pg_cron `crm-run-jobs-every-minute` (`* * * * *`, `?limit=20`).
  - Responde 200.
  - La cola tiene 30.910 jobs en DONE y ninguno FAILED.
  - El paso 3 de "Antes de la ventana" ya está cubierto.

## Ventana (una sola operación; las líneas 3 y 4 no se separan)

```
1. Freeze: nadie despliega ni edita config durante la ventana.
2. Backup: pg_dump -Fc de producción ("C:\Program Files\PostgreSQL\18\bin\pg_dump.exe", DIRECT_URL) → archivo fuera del repo.
3. prisma migrate deploy (25 migraciones) con DIRECT_URL de producción.
4. Bootstrap inmediato (dry-run → --apply --confirm-host <host>):
   subscription-admin.ts --op "upzites=internal,SCALE,COMP" (+ un --op por cada workspace real)
   platform-admin.ts grant <tu email> SUPER_ADMIN
5. Deploy del CRM en la punta de feat/meta-ads-funnel-p34, desde un worktree limpio (sin push) o merge a master (decisión del usuario).
6. Smoke en producción: login, /dashboard, /canales/whatsapp (sin planLimited), /pedidos, /platform, POST run-jobs → 200.
7. Monitor 30 min: logs de Vercel sin 5xx, cola de jobs sin FAILED nuevos.
```

## Rollback

- Código: volver a promover el deploy anterior (`ddbe857`) en Vercel.
- Base: las migraciones solo agregan (tablas, columnas e índices) y rellenan datos nuevos. El código viejo convive con el esquema nuevo, así que no hace falta revertir la base salvo que haya corrupción. En ese caso se restaura el `pg_dump` del paso 2, perdiendo lo escrito durante la ventana.

## Hito

Producción queda en la punta objetivo, con 57/57 migraciones aplicadas, bootstrap correcto, smoke verde y sin 5xx ni jobs fallidos en los 30 minutos siguientes.

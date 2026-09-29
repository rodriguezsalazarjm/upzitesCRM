# P0-D — Platform Admin, billing manual e invitaciones

Estado: implementado en `feat/p0d-platform-admin` (desde `eba9b9f`). Migración
`20260928200000_global_users_invitations` aplicada **solo en crm_pruebas**.

## Foundation step 2 (cuenta global)

- `users.email` único GLOBAL; se elimina el único `(workspace_id, email)`.
- `users.workspace_id` es legacy **nullable**; FK `ON DELETE SET NULL` (borrar un
  workspace no borra una cuenta que pertenece a otros). Las altas nuevas ya no
  lo escriben. `users.role` sigue siendo legacy (se escribe, no autoriza).
- Login, reset, alta y CLI buscan con `findUserByEmail` (`src/lib/identity.ts`,
  trim + minúsculas).
- La migración aborta (sin tocar nada) si hay emails sin normalizar o duplicados.

## Bootstrap del primer SUPER_ADMIN

Pruebas (ya ejecutado): `c2-owner-a@visual.test` es SUPER_ADMIN en crm_pruebas.

```bash
node scripts/run-against-test-db.mjs scripts/platform-admin.ts grant <email> SUPER_ADMIN "bootstrap QA"
```

`run-against-test-db.mjs` fuerza `DATABASE_URL = TEST_DATABASE_URL` y aborta si
coincide con la de producción.

Producción (NO ejecutado; hacerlo recién tras desplegar y migrar):

1. Pre-flight de solo lectura: 0 emails duplicados y 0 sin normalizar (la
   migración igual lo verifica y aborta si no se cumple).
2. `pnpm exec prisma migrate deploy` con `DIRECT_URL` de producción
   (el que funciona es el de `.env.production.local`).
3. Conceder el rol a la cuenta del propietario (la cuenta ya debe existir):

```bash
pnpm exec tsx scripts/platform-admin.ts list
pnpm exec tsx scripts/platform-admin.ts grant <email-del-propietario> SUPER_ADMIN "bootstrap produccion"
```

El script imprime `Base: host/db` antes de actuar: confirmar que es producción.
El CLI usa la misma operación que la UI (`setPlatformRoleFromCli`): mismo
advisory lock y tampoco deja quitar al último SUPER_ADMIN.

## Último SUPER_ADMIN

`src/lib/platform/roles.ts`: el cambio de rol corre en una transacción con
`pg_advisory_xact_lock('platform:roles')`, cuenta los SUPER_ADMIN reales de toda
la plataforma y rechaza (`LAST_SUPER_ADMIN`, 409) dejar cero.

Pruebas (`smoke-p0d` 32a-32e) sin tocar cuentas ajenas a la suite:
`setPlatformRoleInScopeForTests` ejecuta la misma operación con el conteo
acotado a los actores que la suite creó (prohibida en producción y fuera de
`scripts/smoke-*`, verificado en `test:platform`). La carrera concurrente se
prueba ahí. Una foto antes/después comprueba que ningún SUPER_ADMIN externo
cambió. Si la base no tiene SUPER_ADMIN externos, 32d además prueba la ruta real.

## Permisos

| Acción | PLATFORM_ADMIN | SUPER_ADMIN |
|---|---|---|
| /platform, clientes, invitaciones, pagos manuales, renovar, suspender/reactivar, soporte, Ops | sí | sí |
| COMP, `isInternal`, negocio interno propio, roles de plataforma, Price Book | no | sí |

## Invitaciones

Token de 32 bytes (base64url); en la base solo `HMAC(token)`. Un solo uso,
7 días. Reenviar regenera el token (el anterior deja de servir). Aceptar vuelve
a comprobar `users.max` bajo el lock de P0-C y bloquea la fila de la invitación.
Email sin cuenta → nombre + contraseña; con cuenta → iniciar sesión con ella.

## Email transaccional de plataforma

`RESEND_API_KEY` + `PLATFORM_EMAIL_FROM`. No pasa por el email del workspace ni
consume `emails.monthly`. Sin configurar, la UI muestra "Copiar enlace de
invitación".

## Recuperación de contraseña

Identidad global: no depende de workspace ni consume `emails.monthly`.

- `/forgot-password` → `POST /api/auth/password-reset`: respuesta pública
  única (`PASSWORD_RESET_PUBLIC_RESPONSE`) exista o no la cuenta. Si existe,
  token de 32 bytes; en la base solo su HMAC. TTL 60 min. Un token nuevo
  invalida los pendientes.
- `/reset-password/[token]` → `POST /api/auth/password-reset/confirm`: bloquea
  la fila del token y, en UNA transacción, cambia `passwordHash`, sube
  `sessionVersion`, consume el token e invalida los pendientes. Auditado como
  `account.password_reset`. No inicia sesión: se entra por /login.
- Rate limit: solicitud 5/h por IP y 3/h por email destino (silencioso: responde
  igual sin emitir); confirmación 10/15 min por IP.

### Envío diferido del email

La ruta llama `requestPasswordReset(email, { schedule: after })`. `after()` de
Next corre la tarea después de enviar la respuesta (la latencia del proveedor
no delata si la cuenta existe) y en Vercel la plataforma mantiene viva la
invocación (`waitUntil`) hasta que termina. No hay promesas sueltas ni fallback:
fuera de un request de Next, `after` lanza (la suite le da un `afterContext`
real en `scripts/fixtures/request-context.ts`).

La tarea (`deliverPasswordResetEmail`) usa el email de plataforma, reintenta 3
veces con el MISMO token e `idempotencyKey` (sin tokens nuevos) y nunca lanza:
un fallo del proveedor solo va al log y no cambia la respuesta pública. No se usa
la cola de jobs a propósito: exigiría guardar el token en claro en el payload.

QA sin Resend: el enlace sale SOLO al log del servidor
(`[password-reset:qa] ...`), nunca en la respuesta HTTP y nunca con
`NODE_ENV`/`VERCEL_ENV` = production.

## Invalidación global de sesiones (`sessionVersion`)

Migración `20260928210000_user_session_version`: `users.session_version INT NOT
NULL DEFAULT 0` (aplicada solo en crm_pruebas).

- La cookie v2 lleva `sv` = versión con la que se emitió. Cookies sin `sv`
  (todas las actuales) = 0, y todos los usuarios empiezan en 0: desplegar no
  cierra ninguna sesión.
- Toda lectura de sesión verifica `cookie.sv === User.sessionVersion`:
  `readSessionCookie()` (rutas, /platform, invitaciones) y
  `resolveContextForSession()` (contexto del dashboard, proxy de soporte).
  Si no coincide, la sesión es anónima.
- `SessionInput.sessionVersion` es obligatoria. Login/registro usan la versión
  actual del usuario; switch, resolve y soporte REEMITEN conservando la versión
  de la sesión ya verificada (nunca la refrescan desde la base).
- `revokeAllSessions(userId, tx)` (`src/lib/session-revocation.ts`) sube la
  versión: la usa el reset y queda lista para "cerrar sesión en todos los
  dispositivos" (sin UI todavía).
- El proxy solo lee la firma (no consulta versión): nunca concede nada por sí
  mismo; la autorización ocurre en el handler con la sesión verificada.

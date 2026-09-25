# QA Mercado Pago — webhook `TimestampOutOfTolerance` (2026-09-25)

Estado: **fix validado a nivel de firma; E2E de compra TEST pendiente.**
Entorno: local, worktree `C:\dev\upzites-preview`, BD `crm_pruebas` (127.0.0.1). Producción no se tocó.

## Causa

`mercadopago@3.1.0` comparaba el `ts` del header `x-signature` como milisegundos contra
`Date.now()`. Mercado Pago lo envía en **segundos (10 dígitos)**, así que toda notificación real
fallaba con `401 TimestampOutOfTolerance`.

`mercadopago@3.3.0` hace `Number(ts) * 1000` antes del chequeo de tolerancia
(`dist/utils/webhook/index.js`). Ya no acepta `ts` en milisegundos; Mercado Pago nunca los envía.

## Cambios

| Archivo | Cambio |
|---|---|
| `apps/crm/package.json` | `mercadopago` `^3.1.0` → `^3.3.0` |
| `pnpm-lock.yaml` | solo las 3 entradas de `mercadopago` (sin otras dependencias) |
| `apps/crm/src/lib/mercado-pago.test.ts` | firmas con `ts` en segundos + 4 casos nuevos |

Casos cubiertos por los tests:

- firma válida con `ts` de 10 dígitos → válida
- notificación realista (`data.id` numérico, `x-request-id` UUID) → válida
- `ts` vencido (−600 s, tolerancia 300 s) → `TimestampOutOfTolerance`
- firma alterada → `SignatureMismatch`
- `ts` en milisegundos → `TimestampOutOfTolerance` (se documenta; no se mantiene compatibilidad)

## Validaciones

| Chequeo | Resultado |
|---|---|
| `pnpm test:mercado-pago` | 26/26 pass |
| `tsc --noEmit` | sin errores |
| `eslint` (archivos tocados) | sin errores |
| `next build` | OK |

## Pruebas contra el entorno TEST

Túnel cloudflared → `localhost:3001`, token de vendedor TEST y webhook secret TEST
(huella `af71bc1c`).

**Firmas propias a través del túnel**

| Caso | Respuesta |
|---|---|
| firma válida, `ts` 10 dígitos | 500 `Payment not found` (autenticación OK; el pago 123456 no existe) |
| `ts` vencido | 401 `TimestampOutOfTolerance` |
| firma alterada | 401 `SignatureMismatch` |

**"Simular notificación" desde el panel de Mercado Pago**

- `ts` de 10 dígitos, `x-request-id` de 36 caracteres, firma coincide con el secret.
- Respuesta: **500 `Payment not found`**, lo esperado. Ya no hay 401.

**Checkout TEST (Billing → Renovar) en workspace QA `MP QA Renovar`** (`cmuhbq5hb0001tkvyto18uf4j`)

- 2 × `POST /api/billing/checkout` → 200; 2 × `billing.checkout_started` en `audit_logs`.
- Preferencia correcta: 49.000 CLP, `external_reference` = workspace QA,
  `notification_url` = túnel `/api/billing/webhook`.
- **API de Mercado Pago (vendedor TEST): 0 pagos y 0 merchant orders** para ese `external_reference`.
- No hubo retorno `auto_return` a `/billing` ni webhook posterior.
- BD sin cambios: suscripción en TRIAL, sin `mp_payment_id`/`renews_at`, sin `billing.payment_confirmed`.

Conclusión: la compra no quedó aprobada del lado de Mercado Pago. Lo probable es que se usó una
cuenta distinta del comprador TEST, un titular distinto de `APRO`, o la ventana se cerró antes de la
aprobación. **No es un fallo del webhook.**

## Pendiente

1. Repetir el checkout con **comprador TEST** + tarjeta de prueba CL, titular `APRO`, esperando el
   retorno automático a `/billing`.
2. Verificar en BD: `workspace_subscriptions.status = ACTIVE`, `mp_payment_id`, `renews_at`,
   `audit_logs` `billing.payment_confirmed`.
3. Recién entonces cargar credenciales MP en producción (ver memoria release-hardening:
   prod no tiene `MERCADO_PAGO_ACCESS_TOKEN` ni `MERCADO_PAGO_WEBHOOK_SECRET`).

Artefactos locales (gitignored, en `apps/crm/.local-visual/`): `mp-test-dev.mjs` (lanzador),
`mp-test.env` (credenciales TEST, borrar al terminar), `mp-qa-account.json` (acceso al workspace QA),
`mp-db-snapshot.mjs` / `mp-snapshot-before.json` (foto de la BD antes/después).

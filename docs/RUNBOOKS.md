# Runbooks de incidentes — CRM Upzites

Qué hacer cuando algo se rompe. Cada runbook está escrito para leerse **durante**
el incidente: primero cómo cortar el daño, después cómo diagnosticar, al final
cómo reparar.

La regla que atraviesa todos: **cortar antes que entender**. Un agente que
responde mal a clientes reales durante los veinte minutos que toma encontrar la
causa hace más daño que apagarlo y encenderlo después.

---

## Índice

1. [Cortes de emergencia](#1-cortes-de-emergencia)
2. [El agente responde cosas incorrectas](#2-el-agente-responde-cosas-incorrectas)
3. [WhatsApp dejó de entregar mensajes](#3-whatsapp-dejo-de-entregar-mensajes)
4. [La cola se atascó](#4-la-cola-se-atasco)
5. [Un pago no se acreditó](#5-un-pago-no-se-acredito)
6. [Se envió algo que no debía enviarse](#6-se-envio-algo-que-no-debia-enviarse)
7. [La base de datos no responde](#7-la-base-de-datos-no-responde)
8. [Se filtró un secreto](#8-se-filtro-un-secreto)

---

## 1. Cortes de emergencia

Los interruptores viven en `/ops` y también se pueden accionar por API. **Apagar
una función no detiene el CRM**: el equipo sigue usando el inbox, los contactos y
los pedidos.

| Interruptor | Qué deja de pasar | Qué sigue funcionando |
|---|---|---|
| `AI_AGENTS` | El agente no responde | El inbox humano, todo el CRM |
| `JOURNEYS` | Las secuencias no avanzan | Las inscripciones se conservan |
| `CAMPAIGNS` | No sale ninguna campaña | Los destinatarios pendientes se conservan |
| `EMAIL_SENDING` | No sale ningún email | WhatsApp |
| `WHATSAPP_OUTBOUND` | No sale ningún mensaje | Los entrantes se siguen recibiendo |
| `SHOPIFY_SYNC` | El catálogo no se actualiza | Lo ya sincronizado |
| `PAYMENTS` | No se crean checkouts | Los pagos en curso se procesan |
| `WEBHOOKS_INBOUND` | Los webhooks no se procesan | Nada se pierde: quedan en cola |

**Corte de un solo cliente**, desde su propio `/ops` o:

```bash
curl -X POST "$CRM_URL/api/ops/flags" \
  -H "Content-Type: application/json" \
  -b "sesion=..." \
  -d '{"key":"AI_AGENTS","enabled":false,"note":"incidente 2026-09-11"}'
```

**Corte global** (todos los clientes) — no hay interfaz a propósito, para que no
se accione por error:

```sql
INSERT INTO feature_flags (id, scope, key, enabled, note, created_at, updated_at)
VALUES (gen_random_uuid()::text, 'GLOBAL', 'AI_AGENTS', false, 'incidente', now(), now())
ON CONFLICT (scope, key) DO UPDATE SET enabled = false, note = excluded.note;
```

Para volver a encender: `UPDATE feature_flags SET enabled = true WHERE scope = 'GLOBAL' AND key = 'AI_AGENTS';`

Un corte global **gana** sobre el interruptor de un workspace: mientras esté
puesto, un cliente no puede reencender la función por su cuenta.

---

## 2. El agente responde cosas incorrectas

**Síntoma:** un cliente reporta que el agente inventó un precio, prometió un
descuento o confirmó un pago que no existe.

### Cortar

Apagar `AI_AGENTS` del workspace afectado. Las conversaciones quedan esperando a
una persona, que es el estado correcto mientras tanto.

### Diagnosticar

Cada respuesta del agente queda en `agent_runs` con sus herramientas y su texto:

```sql
SELECT id, created_at, output, escalated, error, tool_calls
FROM agent_runs
WHERE workspace_id = '<id>'
ORDER BY created_at DESC
LIMIT 20;
```

- `escalated = true` significa que el guardrail **sí** lo detectó y el mensaje
  **no** salió. Si el cliente igual lo recibió, el problema está en otra parte.
- `escalated = false` con una respuesta problemática significa que el guardrail
  no cubre ese caso. Es un hallazgo: hay que agregar el patrón en
  `src/lib/agents/guardrails.ts` y una prueba en `scripts/smoke-critico.ts`.

### Reparar

1. Agregar el patrón faltante y su prueba.
2. Revisar las instrucciones del agente en `/automatizaciones`: una instrucción
   del cliente puede estar empujando al modelo a inventar.
3. Probar en el simulador antes de reencender.

---

## 3. WhatsApp dejó de entregar mensajes

**Síntoma:** los mensajes salientes quedan en `QUEUED` o el canal aparece en
`NEEDS_ATTENTION`.

### Diagnosticar

```sql
SELECT status, count(*) FROM outbox_events GROUP BY status;
SELECT id, display_phone_number, status, quality_rating, messaging_limit
FROM whatsapp_channels WHERE workspace_id = '<id>';
```

Causas habituales, en orden de frecuencia:

1. **Token vencido.** `token_expires_at` en el pasado. El cliente tiene que
   reconectar desde `/integraciones`.
2. **Ventana de 24 horas cerrada.** Meta no permite texto libre fuera de ella;
   hace falta una plantilla aprobada (pendiente, D17).
3. **Calidad degradada.** `quality_rating` en `RED` limita el envío. Se resuelve
   bajando el volumen, no reintentando.

### Reparar

El outbox reintenta solo con espera creciente (1, 5 y 15 minutos). Lo que quedó
en `FAILED` tras agotar los intentos se reencola a mano:

```sql
UPDATE outbox_events SET status = 'PENDING', attempts = 0, available_at = now()
WHERE status = 'FAILED' AND workspace_id = '<id>';
```

---

## 4. La cola se atascó

**Síntoma:** `/ops` muestra muchos pendientes o trabajos muertos.

### Diagnosticar

```sql
SELECT status, type, count(*) FROM jobs GROUP BY status, type ORDER BY count DESC;
SELECT id, type, attempts, last_error FROM jobs WHERE status = 'DEAD' LIMIT 20;
```

**Un trabajo `DEAD` nunca se reintenta solo.** Es deliberado: agotó sus intentos
y repetirlo sin entender por qué falló solo consume cuota.

### Causas habituales

- **El cron no está corriendo.** En Vercel Hobby corre una vez al día (D19). Es
  la causa más común de "los seguimientos no salen".
- **Trabajos `PROCESSING` viejos**: un worker murió a mitad. Se liberan:

```sql
UPDATE jobs SET status = 'PENDING', run_at = now()
WHERE status = 'PROCESSING' AND updated_at < now() - interval '15 minutes';
```

### Vaciar a mano

```bash
curl -X POST "$CRM_URL/api/internal/run-jobs?limit=50" \
  -H "x-internal-secret: $INTERNAL_WORKER_SECRET"
```

---

## 5. Un pago no se acreditó

**Síntoma:** el cliente pagó y su pedido sigue en `PENDING_PAYMENT`.

### Diagnosticar

El webhook **nunca** confía en lo que le llega: reconsulta el pago contra la API
de Mercado Pago. Si el pedido no avanzó, el webhook no llegó o la reconsulta
falló.

```sql
SELECT id, status, external_id, amount, created_at
FROM payments WHERE order_id = '<id>';

SELECT id, status, total, confirmed_at FROM customer_orders WHERE id = '<id>';
```

Buscar en los logs `billing_webhook_amount_mismatch` y
`billing_webhook_unknown_plan`: los dos rechazan el pago a propósito.

### Reparar

**No marcar el pedido como pagado a mano.** Reenviar el webhook desde el panel
de Mercado Pago: el flujo es idempotente y no duplica la entrega.

Si el monto no coincide con el plan o el pedido, el rechazo es correcto: alguien
manipuló la preferencia o el precio cambió entre la creación y el pago.

---

## 6. Se envió algo que no debía enviarse

**Síntoma:** un contacto que pidió no ser contactado recibió un mensaje, o salió
una campaña a la lista equivocada.

### Cortar

Apagar `CAMPAIGNS` y `JOURNEYS` del workspace. **Primero cortar.**

### Diagnosticar

Todo envío deja rastro:

```sql
SELECT * FROM contact_send_logs
WHERE workspace_id = '<id>' AND contact_id = '<contacto>'
ORDER BY sent_at DESC;

SELECT status, skip_reason, count(*) FROM campaign_recipients
WHERE campaign_id = '<id>' GROUP BY status, skip_reason;
```

`skip_reason` dice por qué **no** se le envió a cada omitido. Si un suprimido
aparece como `SENT`, es un defecto grave: la exclusión vive en
`resolveSegment` y debería haberlo filtrado antes de materializar la lista.

### Reparar

1. Suprimir manualmente a los afectados.
2. Escribir la prueba que reproduce el caso en `scripts/smoke-critico.ts`.
3. Corregir, y recién entonces reencender.

---

## 7. La base de datos no responde

**Síntoma:** `P1001`, `P1011` o timeouts generalizados.

### Diagnosticar

- **`P1011 TlsConnectionError` en local**: una CA que intercepta TLS. Se
  resuelve con `sslmode=no-verify` **solo en local**. En Vercel tiene que ser
  `sslmode=require`.
- **`P1001` con DNS que no resuelve**: el proyecto de Supabase fue pausado o
  eliminado. Ya pasó una vez.
- **Timeouts bajo carga**: el pooler de transacciones (`:6543`) tiene un límite
  de conexiones. Las migraciones van por el de sesión (`:5432`).

### Errores que parecen de base pero no lo son

`P2028` (transacción expirada a los 5 s) casi siempre significa que se metió
demasiado trabajo en una transacción interactiva. Ya ocurrió en el alta de
clientes: la solución fue sacar lo que no era parte de la invariante.

---

## 8. Se filtró un secreto

**Síntoma:** una clave apareció en un log, un commit, un chat o una captura.

### Cortar

En este orden:

1. **Rotar la clave en el proveedor**, no en el CRM. Mientras siga siendo válida
   en origen, cambiarla aquí no sirve de nada.
2. Actualizar la variable en Vercel y redeployar.
3. Si fue `INTEGRATION_ENCRYPTION_KEY`: **no se puede rotar sola**. Los tokens
   guardados están cifrados con ella. Hay que descifrar con la vieja, recifrar
   con la nueva y recién entonces retirarla. El formato lleva versión (`v1:`)
   justamente para esto.

### Qué NO hacer

- Borrar el commit sin rotar la clave. El historial de Git es público en cuanto
  alguien clonó el repositorio.
- Asumir que una clave "de prueba" no importa. Las de Mercado Pago en modo test
  dan acceso a la cuenta.

---

## Contactos y accesos

| Qué | Dónde |
|---|---|
| Base de datos | Supabase, proyecto `mtdtccnchxpwnjllpsog` (us-east-2) |
| Despliegue | Vercel, proyecto `upzites-crm` |
| Repositorio | `github.com/rodriguezsalazarjm/upzitesCRM` |
| Estado de implementación | `docs/IMPLEMENTATION_STATUS.md` |
| Operación diaria | `docs/OPERACION.md` |

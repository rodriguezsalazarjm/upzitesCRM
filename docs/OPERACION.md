# Operación — CRM Upzites

Cómo se opera el CRM día a día: dar de alta un cliente, revisar que todo funciona
y correr las pruebas. Para incidentes, ver [RUNBOOKS.md](RUNBOOKS.md).

---

## Dar de alta un cliente

El alta es guiada y no requiere tocar código. El wizard vive en `/onboarding` y
su avance **se calcula del estado real**: no hay casillas que marcar, hay cosas
que conectar.

### Los 10 pasos

| # | Paso | Quién lo resuelve | Depende de |
|---|---|---|---|
| 1 | Datos del negocio | El cliente | — |
| 2 | Zona horaria y horarios | El cliente | — |
| 3 | Conectar WhatsApp | El cliente + Meta | Credenciales de la app |
| 4 | Tipo de negocio | El cliente | — |
| 5 | Catálogo o reglas de precio | Ambos | Depende del tipo |
| 6 | Cobros | El cliente | Cuenta de Mercado Pago o Shopify |
| 7 | Dominio de envío | El cliente | Acceso a su DNS |
| 8 | Información y políticas | El cliente | — |
| 9 | Probar el agente | Ambos | Nada: funciona sin activar |
| 10 | Activar | Solo el owner | Todo lo anterior |

**Qué se exige depende del tipo de negocio y del plan**, no del rubro:

- **Servicios** → hace falta un `PricingRuleSet` publicado.
- **Ecommerce / infoproducto** → hacen falta productos o una tienda conectada.
- El paso de email solo es obligatorio si el plan incluye `EMAIL`.

### Hasta que se active

El CRM funciona completo: el equipo carga contactos, usa el inbox y responde a
mano. Lo que **no** pasa es que el agente responda solo ni que la recuperación
escriba. Es a propósito: configurar no puede empezar a mandarle mensajes a
clientes reales por accidente.

### Cargar las reglas de precio

Todavía no hay interfaz (D34). Se cargan por API:

```bash
curl -X POST "$CRM_URL/api/pricing-rule-sets" \
  -H "Content-Type: application/json" -b "sesion=..." \
  -d @reglas.json

curl -X POST "$CRM_URL/api/pricing-rule-sets/<id>/publish" -b "sesion=..."
```

Las reglas se validan en **modo estricto**: una clave mal escrita se rechaza en
vez de descartarse. Escribir `conditions` en lugar de `when` dejaba el recargo
sin condición y se le cobraba a todo el mundo.

---

## Planes y consumo

Tres planes, ninguno ilimitado. Las capacidades se consultan por nombre de
capacidad, nunca por nombre de plan.

| | Inicial | Comercial | Completo |
|---|---|---|---|
| Precio | $49.000 | $89.000 | $149.000 |
| Contactos | 1.000 | 5.000 | 20.000 |
| Conversaciones/mes | 500 | 2.000 | 8.000 |
| Costo de IA/mes | $20.000 | $60.000 | $200.000 |
| Emails/mes | — | 10.000 | 50.000 |
| Cotizador | — | Sí | Sí |
| Shopify | — | — | Sí |

> Los precios y cupos son un punto de partida pendiente de aprobación (T22).

**Cambiar de plan pasa por el checkout de Mercado Pago.** No hay endpoint que
cambie el plan sin pagar, a propósito.

Dónde se aplican los límites, es decir, qué pasa de verdad al agotarse:

| Límite | Qué deja de pasar |
|---|---|
| `ai_cost_clp` | El agente deja de responder y levanta un aviso |
| `emails` | No sale email **promocional**; lo operativo sigue |
| `campaign_contacts` | No se puede armar la lista de una campaña |
| `contacts` | No se pueden crear contactos nuevos |
| Capacidad ausente | La función entera responde error antes de hacer nada |

---

## Revisión periódica

### Diaria

- `/ops`: cola pendiente, trabajos muertos, envíos fallidos, funciones apagadas.
- `/onboarding` de cada cliente en configuración: qué le falta.

### Semanal

- `/uso` de cada cliente: quién se está acercando a su cupo.
- Avisos abiertos (`workspace_alerts`): integraciones caídas sin resolver.
- Trabajos `DEAD`: cada uno es un efecto que no ocurrió.

### Mensual

- Cupos consumidos vs. plan: quién necesita subir de plan.
- Costo de IA real vs. estimado.

---

## Trabajos automáticos

El cron llama a `/api/internal/run-jobs`, que encola y procesa:

| Trabajo | Frecuencia | Qué hace |
|---|---|---|
| `SCAN_SCHEDULED_ACTIONS` | cada minuto | Promueve acciones vencidas |
| `PROCESS_OUTBOX` | cada minuto | Despacha mensajes salientes |
| `PROCESS_JOURNEYS` | cada minuto | Avanza las secuencias |
| `SCAN_SILENCE` | cada hora | Detecta contactos en silencio |
| `SCAN_JOURNEY_ENTRIES` | cada hora | Inscribe a quien califique |
| `SCAN_WORKSPACE_HEALTH` | cada hora | Levanta y cierra avisos |
| `REFRESH_SEGMENT_COUNTS` | diaria | Recuenta segmentos |
| `MAINTENANCE` | diaria | Poda trabajos, vence cotizaciones, envejece scores |

> **En Vercel Hobby el cron corre una vez al día** (D19). Con ese plan los
> seguimientos no funcionan. Es lo primero a resolver antes de un piloto real.

---

## Pruebas

Desde `apps/crm`:

```bash
# La que decide si la beta puede venderse (matriz de la spec, sección 18)
pnpm exec tsx scripts/smoke-critico.ts

# Carga moderada sobre cola y webhooks
pnpm exec tsx scripts/carga.ts 300

# Por fase
pnpm exec tsx scripts/smoke-fase1.ts   # ... hasta fase9
```

Todas corren **contra la base real** y limpian lo suyo al terminar. Ninguna
necesita credenciales de Meta, Shopify, Mercado Pago ni OpenAI: usan fixtures y
proveedores guionados.

### Demo o piloto

```bash
pnpm exec tsx scripts/seed-demo.ts
```

Crea un workspace completo y coherente. Es idempotente: volver a correrlo
reemplaza el anterior.

---

## Gotchas que ya costaron tiempo

- **Parar el dev server antes de `pnpm build`.** Reescribe
  `.next/dev/types/routes.d.ts` mientras el build lo lee.
- **Reiniciar el dev server tras cambiar el esquema.** El HMR conserva el
  cliente Prisma viejo y falla con `tx.<modelo> undefined`.
- **`sslmode=no-verify` solo en local.** En Vercel tiene que ser `require`.
- **Nunca modificar una migración ya aplicada.** Rompe el checksum y deja la
  base y el historial en desacuerdo. Se crea una migración nueva.

---

## Variables de entorno

| Variable | Obligatoria | Si falta |
|---|---|---|
| `DATABASE_URL` | Sí | No arranca |
| `DIRECT_URL` | Sí | No se pueden aplicar migraciones |
| `CRM_SESSION_SECRET` | Sí | No arranca |
| `NEXT_PUBLIC_CRM_BASE_URL` | Sí | Los enlaces públicos apuntan a localhost |
| `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | No | El webhook de Meta rechaza todo |
| `MERCADO_PAGO_ACCESS_TOKEN` | No | El checkout devuelve 503 |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | No | No se puede conectar Shopify |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET` | No | El email se registra pero no sale |
| `OPENAI_API_KEY` | No | El agente no puede responder |
| `INTEGRATION_ENCRYPTION_KEY` | No | No se pueden guardar tokens |
| `INTERNAL_WORKER_SECRET` | No | El cron no puede procesar la cola |

Una integración sin configurar **aparece inactiva; no tumba el CRM**. Solo la
base de datos y la firma de sesión son obligatorias para arrancar.

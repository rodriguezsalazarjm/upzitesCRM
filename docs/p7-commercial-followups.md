# Punto 7 — Seguimiento comercial configurable

## Qué resuelve

Cada negocio configura desde **Recuperación** estrategias automáticas para retomar el contacto con quien:

- **no respondió** a su último mensaje;
- **consultó y no compró** (opcionalmente, un producto concreto);
- dejó un **pedido sin pagar** (checkout abandonado, acotado a un producto);
- tiene una **oportunidad abierta sin movimiento**.

Cada estrategia tiene:

- disparador y, si aplica, producto;
- pasos con espera (presets de 1 h / 24 h / 72 h o un valor propio), canal y mensaje fijo o generado por IA;
- límites (máximo de mensajes, separación mínima);
- modo prueba;
- estados de borrador, activa, pausada y desactivada;
- métricas e historial por contacto.

La secuencia se detiene sola cuando el contacto responde, compra (con pago confirmado), lo toma una persona o pide no recibir más mensajes.

## Arquitectura: el mismo motor, no otro

Una **estrategia es un `Journey`**. No hay un segundo motor:

- **Ejecutor:** `lib/marketing/journeys.ts` (`enroll`, `advanceEnrollment`, `processDueEnrollments`).
- **Jobs:** los mismos de siempre:
  - `PROCESS_JOURNEYS` cada minuto;
  - `SCAN_JOURNEY_ENTRIES` cada hora, que ahora también llama a `scanFollowUpEntries`.
- **Archivos nuevos:** extienden ese motor.

| Archivo | Rol |
|---|---|
| `lib/followups/rules.ts` | Reglas puras: disparadores, esquemas Zod estrictos, variables, render, etiquetas de intervalos, motivos de parada, guardas de IA, métricas. |
| `lib/marketing/quiet-hours.ts` | Horario puro: zona del workspace, días hábiles, cambio de hora (extraído de `policy.ts`, que lo reexporta). |
| `lib/followups/send.ts` | Ejecución de un paso de mensaje: límites, conversación, política, ventana de 24 h, modo, composición, registro idempotente, envío o simulación. |
| `lib/followups/ai.ts` | Redacción con IA: capas de los Puntos 4 y 5, créditos de IA y guarda en código. |
| `lib/followups/triggers.ts` | Detectores de los disparadores comerciales. |
| `lib/followups/stop.ts` | Ganchos de parada inmediata (compra, respuesta u opt-out, toma humana). |
| `lib/followups/service.ts` + `http.ts` | Casos de uso (CRUD, estados, cancelar, adelantar en prueba, inscribir en prueba), roles y auditoría. |
| `app/api/followups/**` | API. |
| `app/(dashboard)/recuperacion/**`, `components/followups/**` | Interfaz. |

### Flujo

1. **Detectar:** `scanFollowUpEntries` busca hechos posteriores a `publishedAt` que lleven al menos 30 minutos quietos (`SETTLE_MS`), del producto si la estrategia tiene uno.
2. **Inscribir:** `enroll` guarda `triggeredAt` (el hecho), la conversación, la oportunidad y el pedido.
3. **Programar:** el primer paso se fija en `triggeredAt + espera`, y cada paso siguiente en el momento de ejecución del anterior más su espera. Todo pasa por `nextAllowedInstant`, el horario permitido.
4. **Persistir:** el estado vive en `journey_enrollments` (paso actual, `nextRunAt`, contadores) y `journey_step_runs`. No hay timers en memoria.
5. **Revisar antes de cada paso:** `hardExitReason` comprueba respuesta u opt-out, compra confirmada (del producto), oportunidad movida, pedido cancelado, toma humana y condiciones declarativas.
6. **Enviar:** `runMessageStep`.
7. **Registrar:** un `JourneyStepRun` con estado, texto, canal, motivo y mensaje.
8. **Siguiente paso:** se programa el siguiente o se completa la secuencia.
9. **Cancelar:** los ganchos de `stop.ts` detienen la secuencia en el acto; el chequeo previo al paso es la segunda red.

## Modelos y migración

Migración `20261103120000_commercial_followups`, envuelta en `BEGIN/COMMIT`. Solo se aplicó a `crm_pruebas`.

- **`journeys`:**
  - `product_id`, con FK compuesta `(product_id, workspace_id)` para impedir un producto de otro workspace;
  - `max_messages`, con CHECK 1–10;
  - `min_gap_hours`, con CHECK 0–720;
  - `simulate`.
- **`journey_steps`:**
  - `message_mode` (FIXED | AI);
  - `ai_goal`.
- **`journey_enrollments`:**
  - `triggered_at`;
  - `conversation_id`, `opportunity_id`, `order_id`;
  - `messages_sent`, `last_message_at`;
  - `simulated`;
  - `purchase_order_id`, que es la atribución demostrable.
- **`journey_step_runs`** (nueva):
  - un registro por paso ejecutado;
  - **`UNIQUE (enrollment_id, position)`**, que es la barrera contra el envío duplicado;
  - estados SENDING | SENT | SIMULATED | DONE | SKIPPED | BLOCKED | FAILED.
- **`messaging_policies`:**
  - `send_days`, que por defecto son los 7 días, para no cambiar nada existente;
  - `out_of_hours_behavior` (POSTPONE | SKIP).
- **Enums:**
  - `JourneyTrigger`: + NO_REPLY, INQUIRY_NO_PURCHASE, OPPORTUNITY_STALLED;
  - `JourneyStepAction`: + SEND_INSTAGRAM.

## Reglas

- **Disparadores:** solo cuentan hechos posteriores a la publicación, así que activar una estrategia no le escribe a la base histórica. Un contacto entra una sola vez por estrategia (`UNIQUE (journey, contacto)`).
- **Una secuencia comercial a la vez por contacto.**
  - Lo garantiza un advisory lock por contacto dentro de `enroll`: dos estrategias equivalentes, o dos barridos simultáneos, no abren dos secuencias.
  - Un seguimiento enviado no cuenta como "hecho nuevo" para NO_REPLY.
- **Límites (backend):**
  - `maxMessages` sale con "alcanzó el máximo de mensajes";
  - `minGapHours` reprograma;
  - el horario aplica zona, días y desde/hasta, con DST resuelto por `instantForWallTime`. Fuera del horario, POSTPONE espera la próxima apertura y SKIP omite el paso con motivo;
  - los topes del workspace (`evaluateSend`: consentimiento, frecuencia, seguimientos seguidos sin respuesta) siguen vigentes;
  - el canal permitido;
  - la activación (borrador, pausa o desactivación, plan limitado, flag `JOURNEYS`, workspace activo).
- **Condiciones de parada:**
  - **respuesta** → EXITED;
  - **opt-out explícito** ("stop", "no me escriban", …) → CANCELED, y el contacto no vuelve a entrar en ninguna estrategia;
  - **compra confirmada** (CONFIRMED / PROCESSING / FULFILLED, del producto de la estrategia si lo tiene) → EXITED con `purchase_order_id`. **Un pago pendiente no detiene nada.** La postventa (ORDER_PAID) no se detiene por compra;
  - **toma humana** → EXITED, y el mensaje automático todavía en cola se cancela (comportamiento existente de `activateHumanControl`);
  - **desactivar** → CANCELED con "la estrategia se desactivó";
  - **pausar** → congela, sin perder el paso.
- **Mensajes fijos:**
  - solo se aceptan `{{nombre}}`, `{{producto}}` y `{{negocio}}`;
  - una variable desconocida o `{{producto}}` sin producto se rechaza al guardar;
  - el valor reemplazado no se reinterpreta;
  - el editor muestra una vista previa.
- **Mensajes con IA:**
  - **Contexto autorizado:** usa solo las capas autorizadas (reglas de plataforma, conocimiento del workspace del Punto 5, Product Sales Brain del Punto 4, la conversación del contacto, los seguimientos ya enviados y el objetivo del paso). Todo se consulta acotado a `workspaceId`.
  - **Guarda en código** (`aiMessageViolation`): descarta descuentos o beneficios, plazos de entrega, urgencia o stock, estados de pago, una garantía no configurada y montos que no sean precios configurados. Si el texto se descarta, sale el texto de respaldo; sin respaldo, el paso queda FAILED.
  - **Créditos:** consume créditos de IA y respeta `checkAiCredits`.
  - **Sin poder de envío:** la IA no decide nada del envío. Llega cuando todas las paradas ya se comprobaron.

## Motor: idempotencia, concurrencia, reintentos y reinicio

- **Claim con lease:** `advanceEnrollment` mueve `nextRunAt` a `now + 10 min` con un `updateMany` condicional, y solo un worker gana. Si el proceso muere, la inscripción vuelve a vencer sola.
- **Reserva antes de enviar:** el `JourneyStepRun` en SENDING guarda el texto compuesto. Al retomar:
  - **WhatsApp:** se reencola con la **misma clave de outbox** (`followup:{enrollment}:{position}`). Si el canal ya lo había aceptado, devuelve el mismo mensaje.
  - **Instagram:** el envío es directo, sin idempotencia, así que el paso queda **FAILED, "resultado incierto"**. **No se reintenta** para no duplicar un mensaje que el proveedor pudo haber aceptado.
- **Un paso ya terminal no se repite:** si el proceso muere entre ejecutar y avanzar, la siguiente corrida ve el registro y solo avanza.
- **Reintentos controlados:** la entrega de WhatsApp la reintenta el outbox existente (4 intentos con backoff). Los rechazos del canal se registran como BLOQUEADO y no se reintentan: consentimiento, control humano, canal desconectado, plan o ventana.
- **Auditoría por workspace:**
  - `followup.created|updated|duplicated|published|paused|archived|test_enrolled`;
  - `journey.enrolled|exited|completed`.

## Canales

- **WhatsApp:** se respeta la ventana de 24 h (`customer_service_window_ends_at`). Fuera de ella el paso queda **BLOQUEADO**, con el motivo "requiere una plantilla aprobada", visible en el historial. **Nunca se envía texto libre.** El gestor de plantillas es el Punto 26.
- **Instagram:**
  - usa la capacidad existente (`sendChannelMessage`, una cuenta conectada);
  - la ventana de 24 h se cuenta desde el último mensaje entrante;
  - sin conversación abierta por Instagram, el paso se omite.
  - No se agregaron capacidades nuevas; los Puntos 11 y 28 quedan fuera.
- **Modo prueba (`simulate`):**
  - todo corre igual (disparadores, tiempos, horario, límites, ventana, paradas), pero ningún mensaje sale: el paso queda SIMULATED, sin `Message`;
  - en la interfaz se marca "Modo prueba: no se envía nada";
  - solo en prueba existen "Inscribir en prueba" y "Ejecutar paso ahora";
  - una estrategia duplicada nace en prueba.

## Interfaz

- **`/recuperacion`:**
  - horario de envío editable (zona, desde/hasta, días, comportamiento fuera de horario), con los topes del workspace a la vista;
  - lista de estrategias con estado, disparador, producto, métricas, próximo y último paso, y las acciones activar / pausar / duplicar;
  - segmentos y campañas, como antes.
- **`/recuperacion/nueva`** y **`/recuperacion/[id]?editar=1`** (editor):
  - disparador con ayuda;
  - producto;
  - límites y modo prueba;
  - pasos con presets de espera, la etiqueta "X después de [evento]", reordenar, canal, modo fijo o IA, variables y vista previa.
  - Se valida con el mismo esquema que el servidor. Una estrategia activa se pausa antes de editarla.
- **`/recuperacion/[id]`:**
  - métricas reales, con lo simulado aparte;
  - pasos;
  - prueba con un contacto;
  - historial por inscripción, con la línea de tiempo de cada paso (enviado, simulado, bloqueado, fallido, IA) y el motivo de parada;
  - acciones cancelar y ejecutar ahora (solo en prueba).
- **Ficha del contacto:** tarjeta **Seguimientos** con su historial.
- **QA visual:** escritorio y 375 px.

## Métricas

`summarizeFollowUps` cuenta:

- iniciados, en curso, programados, completados, cancelados o detenidos;
- respondieron, opt-out, toma humana;
- enviados, errores y bloqueos;
- compras vinculadas.

Reglas de conteo:

- **Compra vinculada** = una compra confirmada que detuvo una inscripción real que ya había enviado al menos un mensaje. Una compra posterior sin seguimiento previo no se atribuye.
- **Lo simulado se cuenta aparte** (`simulatedStarted`, `simulatedMessages`) y no entra en ninguna métrica real.

## Seguridad

- **Aislamiento multi-workspace:**
  - toda lectura y escritura va acotada por `workspaceId`;
  - la FK compuesta protege el producto;
  - el único barrido global (`crossTenantPrisma.journey` en `triggers.ts`) está registrado en la allowlist y cada candidato se busca dentro de su workspace.
- **Roles:** OWNER y ADMIN crean, editan, activan, pausan, desactivan, cancelan y prueban. MEMBER solo ve.
- **Entitlements:** activar exige `campaigns.journeys`, `channels.messaging` si hay pasos de WhatsApp o Instagram, `ai` si hay pasos con IA, y `recovery` para el checkout abandonado.
- **Consentimiento:** se aplica `evaluateSend` y el consentimiento del outbox de WhatsApp. Revocar el consentimiento ya sacaba al contacto de sus journeys.

## Pruebas

- **`pnpm test:followups`** (unitarias, sin base): 10/10. Cubren:
  - esquema (estricto, límites, fijo / IA / variables / producto);
  - render seguro;
  - etiquetas de intervalos;
  - horario dentro y fuera, días hábiles y **DST de Chile** (abril 2026);
  - opt-out;
  - guardas de IA;
  - métricas con atribución y simulación separadas.
- **`pnpm test:smoke:followups`** (base `crm_pruebas`, **reloj controlado**, rutas reales con sesión firmada): **49/49**.

| # | Caso | Evidencia en el smoke |
|---|---|---|
| 1 | creación | 1a–1e: validación (400), producto ajeno (404), borrador, edición con versión, duplicado en prueba, no editar activa (409) |
| 2 | intervalos | 2a–2c: primer paso desde la consulta, no antes de tiempo, siguiente desde la ejecución |
| 3 | dentro de horario | 3 |
| 4 | fuera de horario | 4a–4c: viernes tarde → lunes 09:00; sábado POSTPONE; SKIP con motivo |
| 5 | 3 pasos | 5 |
| 6 | respuesta | 6a gancho; 6b chequeo previo; 6c opt-out |
| 7 | compra confirmada | 7 + E2E-2/3 |
| 8 | pago pendiente | 8 |
| 9 | toma humana | 9 (incluye la cancelación del mensaje en cola) |
| 10 | pausa manual | 10a–10b |
| 11 | desactivación | 11 |
| 12 | máximo de intentos | 12a–12c (+ separación mínima) |
| 13 | concurrencia | 13 (6 workers → 1 paso, 1 mensaje) |
| 14 | idempotencia | 14a–14b + E2E-4 |
| 15 | reintento seguro | 15a (misma clave de outbox) y 15b (Instagram incierto → FAILED) |
| 16 | reinicio del worker | 16a–16b (lease y reanudación con el texto reservado) |
| 17 | aislamiento | 17 |
| 18 | roles | 18, 18b |
| 19 | mensaje con IA | 19a–19d (contexto, sin datos ajenos, descuento descartado, falla sin respaldo) |
| 20 | canal o plantilla bloqueado | 20a–20b (ventana de 24 h, modo no automático, sin consentimiento) |

Criterio de cierre (E2E): un OWNER configura la estrategia (ruta), el lead consulta y no compra, el barrido lo inscribe, los pasos se programan y se ejecutan sin duplicar, el pago pendiente no lo detiene, la compra sí, no sale nada más y el historial y las métricas lo muestran. Se ejecutó en el smoke y en la QA visual (en modo prueba, con el checkout demo).

## Qué está validado y cómo

| Ámbito | Estado |
|---|---|
| Motor, reglas, límites, paradas, idempotencia, concurrencia, reinicio, aislamiento, roles | **Implementado y validado con simulaciones** contra `crm_pruebas` (reloj controlado). |
| Envío por WhatsApp | **Implementado; validado hasta el outbox.** El smoke crea `Message` QUEUED + `OutboxEvent` y **nunca procesa el outbox**: ningún mensaje llegó a Meta. |
| Envío por Instagram | **Implementado** con la capacidad existente; solo se validó el bloqueo por resultado incierto. Sin envío real. |
| IA | **Validada con proveedor guionado** (y el proveedor local determinista en la QA visual). Sin llamadas reales a OpenAI. |
| Pago | Validado con `processOrderPayment` (contrato del webhook) y el checkout demo. **Mercado Pago real no se validó.** |
| Canales reales | **No validado.** Requiere un número de WhatsApp y una cuenta de Instagram conectados en un entorno controlado. |

## Pendientes externos y límites conocidos

- **Plantillas de WhatsApp (Punto 26):** fuera de la ventana de 24 h los pasos quedan bloqueados. Con plantillas aprobadas se podrá escribir fuera de ella.
- **Producción:** la migración no está aplicada en producción. Se aplica con el resto de las migraciones pendientes, en su ventana.
- **Una vez por estrategia:** un contacto entra una sola vez por estrategia. Si respondió y semanas después vuelve a consultar sin comprar, esa misma estrategia no lo vuelve a tomar. Puede tomarlo otra estrategia.
- **Checkout abandonado sin producto:** usa el segmento general del motor anterior, sin `triggered_at`. Con producto usa el pedido exacto.
- **Cotización pendiente:** sigue con el barrido por segmento existente.
- **Journeys de fábrica:** los anteriores (lead sin respuesta, postventa…) aparecen en la lista. Se pueden activar, pausar o duplicar, pero no editar en el nuevo editor si usan pasos del motor anterior (email, temperatura, salida).

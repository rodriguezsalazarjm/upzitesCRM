# Punto 8 — WhatsApp Channel Manager

Rama `feat/whatsapp-channel-manager` (desde `2054e9d`, cierre del Punto 7). Sin push, sin despliegue y sin migraciones productivas.

## 1. Qué hace

Un OWNER o ADMIN entra a **Canales → WhatsApp** (`/canales/whatsapp`). Desde ahí:

- ve sus números;
- agrega uno con Meta (Embedded Signup) o, en pilotos, a mano;
- configura cada número: identidad, agente, producto, automatización, IA, horario y fallback humano;
- verifica o reconecta, prueba el webhook, hace un envío de prueba autorizado y desconecta;
- consulta la actividad y los errores.

Los mensajes entrantes llegan al Inbox de siempre con el contexto del número que los recibió.

## 2. Qué se reutilizó y qué es nuevo

| Pieza | Estado previo | Punto 8 |
|---|---|---|
| `WhatsAppChannel` | Un número por fila. `phone_number_id` era único global y tenía token cifrado. | Se agregan columnas de configuración y observabilidad. No hay modelo nuevo de canal. |
| Webhook `/api/webhooks/whatsapp` | Firma HMAC, ingesta idempotente y cola. | Sin cambios en la verificación. Se anota `lastWebhookAt`. |
| `processWebhookEvent` / `applyInboundMessage` | Contacto, consentimiento, conversación, mensaje y agente. | Resuelve el contexto del número: producto, agente, automatización y fallback. |
| Outbox (`whatsapp/outbound.ts`) | Envío idempotente con reintentos. | Un fallo deja `lastError*` en el número. |
| Runner de agentes | Siempre usaba el agente `SALES`. | Usa el agente del número si hay uno, y respeta IA apagada y horario. |
| Conexión | Formulario manual con token (`/connect`), verificación (`/status`) y desconexión. | La lógica pasa a `channel-manager.ts`. Se agrega Embedded Signup v4. Las rutas viejas quedan compatibles. |
| Integraciones | Tarjeta con formulario manual. | Tarjeta resumen con enlace a Canales → WhatsApp. |
| Inbox | — | Cada conversación muestra el número por el que entró. |

No hay segundo sistema de mensajería, segunda bandeja ni segundo motor de automatización.

## 3. Modelo y migración

Migración: `prisma/migrations/20261104120000_whatsapp_channel_manager`. Está envuelta en `BEGIN/COMMIT` y se aplicó **solo a `crm_pruebas`**.

Columnas nuevas en `whatsapp_channels`:

| Grupo | Columnas |
|---|---|
| Identidad | `label`, `usage` (`SALES` / `SUPPORT` / `GENERAL`), `connection_method` (`EMBEDDED_SIGNUP` / `MANUAL`) |
| Contexto comercial | `default_agent_id`, `default_product_id`, `default_flow_id` (FK con `ON DELETE SET NULL`) |
| Atención | `ai_enabled`, `ai_schedule` (`ALWAYS` / `IN_HOURS` / `OUT_OF_HOURS`), `attention_timezone`, `attention_start_minute`, `attention_end_minute`, `attention_days`, `no_product_behavior` (`AI_GENERAL` / `HUMAN`), `fallback_user_id` |
| Observabilidad | `last_webhook_at`, `last_inbound_at`, `last_error_code`, `last_error_message`, `last_error_at` |

Todas tienen default. Un canal existente queda igual que antes: IA siempre activa, sin defaults, agente de ventas. Un CHECK limita los minutos del horario a 0–1439.

Las FK simples no impiden referencias a otro workspace. Por eso cada id se valida contra el workspace del actor **al guardar** (`updateChannelSettings`) y **otra vez al resolver cada mensaje** (`loadChannelContext`).

## 4. Conexión con Meta

### Embedded Signup v4 (camino principal)

1. El navegador carga el SDK de Meta y llama a `FB.login`. Usa `config_id`, `response_type: 'code'` y `override_default_response_type: true`.
2. Escucha `WA_EMBEDDED_SIGNUP`, que trae `waba_id` y `phone_number_id`, solo desde orígenes `facebook.com`.
3. Envía `{code, wabaId, phoneNumberId, pin?}` a `POST /api/integrations/whatsapp/embedded-signup`.
4. El servidor:
   - cambia el `code` por un token de negocio en `GET oauth/access_token`, con `client_secret`, servidor a servidor;
   - registra el número (`POST /{phone}/register` con el PIN de dos pasos) si se envió PIN;
   - verifica **contra Meta** que el número pertenece a esa WABA. Los ids del navegador no se dan por buenos;
   - suscribe la app (`POST /{waba}/subscribed_apps`);
   - guarda el canal con el token cifrado.

**Requisitos externos.** Si faltan, la pantalla lo dice y ofrece solo la conexión manual.

- La app de Meta debe ser **Tech Provider** (o Solution Partner).
- Debe existir una configuración de **Facebook Login for Business**, variante WhatsApp Embedded Signup.
- Variables de entorno: `META_APP_ID`, `META_APP_SECRET` y `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`.
- El dominio debe estar en *Allowed domains* y *Valid OAuth redirect URIs*.
- Permisos: `whatsapp_business_management` y `whatsapp_business_messaging`. Para clientes externos requieren App Review aprobado y verificación del negocio.
- Webhook `account_update` suscrito en la app, recomendado por Meta.
- Meta retira Embedded Signup v2 y v3 el 15-10-2026. Este código usa v4.
- El cliente debe tener un método de pago en WhatsApp Manager para quedar operativo.

### Conexión manual (pilotos asistidos)

Se conserva el formulario con WABA ID, Phone Number ID y token de usuario del sistema. Funciona así:

- el token viaja una vez;
- se verifica contra Meta antes de guardarse;
- se guarda cifrado (AES, `INTEGRATION_ENCRYPTION_KEY`);
- no se devuelve en ninguna respuesta.

La pantalla lo presenta plegado, como alternativa.

### Reglas comunes (`saveVerifiedChannel`)

- El plan (`channels.max`) y la propiedad del número se deciden **antes** de hablar con Meta (`assertCanConnect`).
- Bajo el lock de `channels.max`, `phone_number_id` es único global. Otro workspace recibe 409 (`CHANNEL_TAKEN`). El mismo workspace actualiza su fila y no se duplica.
- Reconectar un número desconectado se audita como `whatsapp.channel_reconnected`. Conserva la configuración y el historial.
- Un intento fallido se audita como `whatsapp.connect_failed`. Si el número ya existía, queda además como su último error. Un número conectado no se degrada por un intento fallido de cambiar su credencial.

## 5. Estados visibles (sin falsos positivos)

`channelDisplayStatus` en `channel-settings.ts`:

| Estado | Cuándo |
|---|---|
| Conectado | `CONNECTED`, **verificado por Meta** (`lastHealthCheckAt`) y con credencial. |
| Configuración pendiente | `PENDING`, nunca verificado, o sin credencial. Tener credenciales guardadas no basta. |
| Error | `NEEDS_ATTENTION`: credencial inválida, rechazo de Meta o envío con 190/401/403. |
| Permisos insuficientes | Meta respondió código 10 o 200–299 (`PERMISSION_DENIED`). |
| Desconectado | Desconectado por el cliente. |

Estado del webhook:

- **Recibiendo eventos de Meta**: llegó un evento real en los últimos 7 días.
- **Suscrito, sin eventos todavía**: hay suscripción confirmada pero no ha llegado ningún evento.
- **Sin suscripción confirmada**: no hay ninguna de las dos.

"Probar webhook" pregunta a Meta (`GET /{waba}/subscribed_apps`, exige `META_APP_ID` en la lista) y muestra el último evento real. No fabrica eventos propios.

Si Meta no está disponible (`META_UNAVAILABLE`), el canal no se marca en error.

## 6. Recepción y resolución por número

Orden en `applyInboundMessage`. Los pasos 1 a 6 ya existían; el 4 y el 5 se completaron.

1. La firma HMAC sobre el cuerpo crudo se valida en la ruta. Una firma inválida responde 401 y no se guarda nada.
2. El evento crudo se persiste de forma idempotente (`provider + dedupeKey`). Una reentrega se marca como duplicada y no se encola.
3. El workspace se resuelve **solo** por `phone_number_id`. Un número desconectado no abre conversaciones.
4. Contacto, consentimiento, conversación y mensaje en una transacción, con `externalMessageId` único. También se anotan `lastInboundAt` y `lastWebhookAt`.
5. `loadChannelContext` vuelve a validar cada default y llama a `resolveChannelContext`, que es puro:
   - **Producto**: el de la conversación, si ya tenía uno (atribución previa). Si no, el del número si está activo. Si no, ninguno, con aviso si el default dejó de ser válido.
   - **IA**: no atiende si `aiEnabled` está apagado, si está fuera del `aiSchedule` según el horario (zona IANA, días, ventanas nocturnas, cambio de hora), si el agente del número no está disponible, o si no hay producto y `noProductBehavior = HUMAN`. Un agente no disponible **nunca** se reemplaza por otro.
   - **Automatización**: solo si sigue publicada, con WhatsApp en su alcance y disparada por `MESSAGE_RECEIVED`.
6. Si la conversación es nueva o reabierta, o si hubo avisos, se audita `whatsapp.context_resolved` o `whatsapp.human_fallback` con el motivo.
7. Automatización predeterminada: se arranca con `triggerDedupeKey = whatsapp:{wamid}`. Una reentrega no la arranca dos veces. Si arranca, ella conduce y el agente no responde encima.
8. Si la IA puede atender, se programa el agente (debounce). La conversación sigue en `WAITING` hasta que el agente realmente corre.
   - **Corrección de comportamiento.** Desde `4a0d792`, el runner descartaba la respuesta de cualquier conversación que no estuviera en `AI_ACTIVE`. Una conversación nueva de WhatsApp (`WAITING`) gastaba la llamada al modelo y no respondía.
   - Ahora el runner, después de todos sus frenos (agente publicado, plan, créditos, workspace activo, configuración del número) y con el lock tomado, pasa `WAITING` a `AI_ACTIVE`, igual que ya hacía `startFlowRun`.
   - Un workspace sin agente publicado sigue mostrando la conversación como "esperando" (lo exige `smoke-fase2`). Nunca se toca una conversación con humano, pausada o cerrada.
9. Si la IA no puede atender, la conversación se asigna al fallback humano del número (si no tenía responsable) y se avisa (`HUMAN_ATTENTION`). Sin fallback, el aviso va al equipo.
10. El runner vuelve a leer la configuración del número al ejecutarse, porque pudo cambiar en los segundos de debounce. Usa el agente del número y aborta con el motivo si la IA ya no puede atender. El simulador (`dryRun`) no depende del número.

Las prioridades de anuncios, campañas y CTWA son los Puntos 9 y 10. **No se implementaron.**

## 7. IA y conocimiento

El agente recibe exactamente lo que ya armaba el runner:

- instrucciones de su versión publicada;
- capa del workspace (Punto 5, por búsqueda);
- capa del producto (Punto 4, solo el producto de la conversación);
- historial reciente y resumen.

No se arma un prompt con el catálogo. Las herramientas de producto quedan acotadas al producto activo.

Un producto sin ficha comercial (`ProductSalesBrain`) se asigna igual, pero no aporta capa de conocimiento. Es el comportamiento del Punto 4.

## 8. Seguridad

- **Roles**: solo OWNER y ADMIN configuran, conectan, verifican, prueban o desconectan. El chequeo está en la ruta (`role-matrix.test.ts` lo exige) y otra vez en el servicio. Un MEMBER puede ver el número, nunca el token.
- **IDOR**: un canal de otro workspace responde 404, igual que uno inexistente. Agente, producto, automatización y persona de fallback se validan contra el workspace.
- **Credenciales**: el token se guarda cifrado y ninguna respuesta lo devuelve, ni cifrado (`present()` lo excluye). Los mensajes de error de Meta no se reenvían crudos. `client_secret` solo vive en el servidor.
- **Webhook**: firma HMAC sobre el cuerpo crudo, rate limit e idempotencia por evento y por mensaje.
- **Desconexión**: borra el token, la suscripción y la verificación. Deja de procesar entrantes y conserva historial y configuración.
- **Auditoría**: entidad `WhatsAppChannel`, con estas acciones:
  - conexión: `channel_connected`, `channel_reconnected`, `credentials_updated`, `connect_failed`, `channel_disconnected`;
  - verificación: `verification_failed`;
  - configuración: `settings_updated`;
  - pruebas: `webhook_tested`, `webhook_test_failed`, `test_send_queued`;
  - mensajes entrantes: `context_resolved`, `human_fallback`.
- **Plan**: `channels.max` al conectar o reactivar. `agents` al asignar un agente. Un canal limitado por el plan no envía, no arranca automatizaciones y la IA no responde.

### Envío de prueba autorizado

Solo va a un contacto que escribió a **ese** número y cuya ventana de 24 h sigue abierta, que es el único envío libre sin plantilla. Además:

- pasa por el outbox normal;
- usa la clave de idempotencia `channel-test:{canal}:{conversación}:{hash}:{minuto}`, así que un doble clic no envía dos veces;
- se confirma en un diálogo y se audita.

Las plantillas son el Punto 26.

## 9. API

| Método y ruta | Uso |
|---|---|
| `GET /api/integrations/whatsapp/status` | Números del workspace y configuración del entorno (compatibilidad). |
| `POST /api/integrations/whatsapp/status` | Verificar `{channelId}` (compatibilidad). |
| `POST /api/integrations/whatsapp/connect` | Conexión manual. |
| `GET /api/integrations/whatsapp/embedded-signup` | Configuración pública. |
| `POST /api/integrations/whatsapp/embedded-signup` | Cierre del flujo. |
| `GET /api/integrations/whatsapp/channels/[id]` | Detalle. |
| `PATCH /api/integrations/whatsapp/channels/[id]` | Configuración (Zod estricto). |
| `POST /api/integrations/whatsapp/channels/[id]/verify` | Verificar o reconectar con la credencial guardada. |
| `POST /api/integrations/whatsapp/channels/[id]/disconnect` | Desconectar. |
| `POST /api/integrations/whatsapp/disconnect` | Desconectar `{channelId}` (compatibilidad). |
| `POST /api/integrations/whatsapp/channels/[id]/test-webhook` | Probar webhook. |
| `GET /api/integrations/whatsapp/channels/[id]/test-send` | Destinatarios en ventana. |
| `POST /api/integrations/whatsapp/channels/[id]/test-send` | Envío de prueba. |

## 10. Pruebas

- **Unitarias** (`src/lib/whatsapp/channel-context.test.ts`, dentro de `test:whatsapp`), 10 casos:
  - prioridad del producto;
  - default inactivo;
  - IA apagada;
  - `IN_HOURS` y `OUT_OF_HOURS`;
  - agente no disponible;
  - sin producto con `HUMAN`;
  - automatización inválida;
  - ventana nocturna por día;
  - cambio de hora en Chile (abril de 2026).
- **Smoke** (`scripts/smoke-whatsapp-channels.ts`, `test:smoke:whatsapp-channels`, incluido en `smoke:all`), 39 checks contra `crm_pruebas`, por las rutas reales, con sesión firmada y webhook firmado:
  - **E2E (10 checks).** El OWNER conecta por Embedded Signup (Meta simulado) y asigna agente y producto. Llega un mensaje firmado. Se crean contacto y conversación con el producto del número, y la conversación aparece en el Inbox con el nombre del número. Responde el agente del número con el producto en contexto, y la respuesta queda en cola sin salir a Meta.
  - **Casos 1 a 20:**
    1. registrar;
    2. duplicados entre workspaces y dentro del mismo;
    3. agente;
    4. producto;
    5. automatización;
    6. persistencia y validación;
    7. permisos;
    8. aislamiento;
    9. webhook;
    10. firma inválida;
    11. deduplicación de mensaje y automatización;
    12. contacto;
    13. conversación;
    14. Inbox;
    15. contexto por número;
    16. fallback humano, y default inválido no inventado;
    17. desconexión;
    18. reconexión;
    19. errores: token inválido, Meta caída, permisos, webhook no suscrito, code vencido, estado fallido, auditoría y envío de prueba;
    20. plan: FREE no conecta ni consulta a Meta; asignar un agente respeta el plan.
- **Qué simulan**: Meta se simula solo en `fetch` hacia `graph.facebook.com`, y el resto de la red está bloqueado por el fixture. El outbox nunca se procesa y el agente usa `ScriptedProvider`.
- **QA en navegador** (servidor local contra `crm_pruebas`, workspace de QA B):
  - el OWNER configuró desde la UI el nombre interno, el uso, el producto por defecto y el fallback humano;
  - con `scripts/visual/p8-inbound.ts` (mismo pipeline del webhook, sin Meta) llegó un mensaje: la lista y el detalle pasaron a "Recibiendo eventos de Meta", con última actividad, contadores y actividad auditada ("Configuración actualizada", "Conversación con contexto del número");
  - el Inbox muestra el nombre del número en cada conversación;
  - a 375 px ni la lista ni el detalle tienen scroll horizontal;
  - el envío de prueba no se ejecutó.

## 11. Validación real con Meta: pendiente

**No se hizo.** No hay en el entorno:

- una app de Meta Tech Provider con configuración de Embedded Signup;
- un número de prueba de WhatsApp Cloud API con su WABA;
- un token;
- un webhook público apuntando a este entorno.

### Para hacerla

1. En la app de Meta, completar lo listado en la sección 4. Configurar el webhook en `https://<entorno>/api/webhooks/whatsapp` con `WHATSAPP_VERIFY_TOKEN` y suscribirlo a los campos `messages` y `account_update`.
2. Definir en el entorno de staging:
   - `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`;
   - `WHATSAPP_VERIFY_TOKEN`, `INTEGRATION_ENCRYPTION_KEY`;
   - opcional: `WHATSAPP_GRAPH_API_VERSION` (por defecto `v26.0`).
3. Como OWNER, en **Canales → WhatsApp → Conectar con Meta**, autorizar el número de prueba. Agregar el PIN si es un número nuevo.
4. Configurar el número con agente publicado, producto con ficha comercial e IA activa.
5. **Probar webhook.** Debe responder que Meta confirma la suscripción.
6. Desde un teléfono **de prueba propio**, escribir al número. Comprobar que el estado pasa a "Recibiendo eventos" y que la conversación entra al Inbox con el producto del número.
7. Opcional y solo con ese mismo teléfono: **Probar envío autorizado**. El estado entregado o leído debe llegar por el webhook.

## 12. Limitaciones conocidas

- La resolución de contexto es la básica por número. Anuncios, campañas y CTWA quedan para los Puntos 9 y 10.
- Las plantillas de WhatsApp (envíos fuera de la ventana de 24 h) son el Punto 26.
- `ProductSalesBrain` sigue siendo condición para que un producto aporte conocimiento al agente (Punto 4).
- La conexión manual se mantiene para pilotos. En producción con clientes externos, el camino esperado es Embedded Signup.
- "Recibidos" y "fallos" se cuentan sobre los últimos 7 días, desde los mensajes guardados.
- El test unitario `test:instagram` ya fallaba antes de este punto, porque importa Prisma sin `DATABASE_URL`. No es una regresión del Punto 8.

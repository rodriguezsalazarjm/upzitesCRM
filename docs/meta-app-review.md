# Upzites Flow: preparación para Meta App Review

Fase D1 · preparación local, sin conexión API real todavía. Este documento
lista los casos de uso que habrá que demostrar en la revisión de la app de
Meta, y por qué se necesita cada permiso. No es el texto definitivo para el
formulario de Review — eso se redacta cuando haya una app real conectada y
capturas/video reales que grabar.

## Instagram — Business Login for Instagram

| Permiso | Por qué lo necesita Upzites Flow |
| --- | --- |
| `instagram_business_basic` | Leer la identidad de la cuenta profesional conectada (ID, username) para mostrarla en Integraciones y para enrutar los webhooks entrantes a la cuenta correcta. |
| `instagram_business_manage_messages` | Recibir DMs entrantes y responder — es el canal base de Inbox y del motor de automatizaciones. |
| `instagram_business_manage_comments` | Detectar comentarios en publicaciones/reels y responder (pública o privadamente) — es el caso comercial prioritario: comentario → DM. |

No se pide `instagram_business_content_publish`: Upzites Flow no publica
contenido, solo mensajería y comentarios (principio de mínimo privilegio,
spec Fase D1 sección 2).

### Caso de uso 1 — Conectar cuenta y recibir/responder un DM

1. El owner del workspace entra a Integraciones → "Conectar Instagram".
2. Autoriza vía Business Login for Instagram.
3. Upzites Flow confirma la conexión (username visible, estado CONNECTED).
4. Un cliente le escribe un DM a la cuenta conectada.
5. El mensaje aparece en el Inbox de Upzites Flow.
6. Un operador (o el agente de IA configurado) responde desde el Inbox.

### Caso de uso 2 — Comentario → respuesta pública → DM privado

1. Un usuario comenta una publicación con una palabra clave configurada
   (ej. "GUIA").
2. Upzites Flow detecta el comentario vía webhook.
3. Responde públicamente al comentario (opcional, configurable por
   automatización) confirmando que le llegó un DM.
4. Envía una respuesta privada al comentario (Private Reply,
   `POST /{comment-id}/private_replies` — no un DM genérico) con el
   contenido solicitado.
5. Se registra la conversación y el contacto en el CRM.

## Messenger — Facebook Login + Facebook Page

| Permiso | Por qué lo necesita Upzites Flow |
| --- | --- |
| `pages_show_list` | Listar las Pages administradas por el usuario para que elija explícitamente cuál conectar (nunca se elige la primera en silencio). |
| `pages_manage_metadata` | Suscribir la app a los webhooks de la Page (`subscribed_apps`) después de conectarla. |
| `pages_messaging` | Recibir y enviar mensajes de la Page — canal base de Inbox y automatizaciones. |
| `pages_read_engagement` | Leer comentarios de publicaciones de la Page (webhook `feed`) para el mismo caso comercial prioritario que Instagram: comentario → respuesta. |

### Caso de uso 3 — Conectar una Page y responder un mensaje

1. El owner entra a Integraciones → "Conectar Messenger".
2. Autoriza vía Facebook Login.
3. Si administra varias Pages, Upzites Flow muestra "Selecciona la Página
   que quieres conectar" — nunca conecta una Page sin que el usuario la
   elija.
4. Un cliente le escribe a la Page conectada.
5. El mensaje aparece en el Inbox; un operador o la IA responde.

### Caso de uso 4 — Comentario/private reply flow (si aplica)

Mismo patrón que Instagram: comentario en una publicación de la Page →
respuesta pública opcional → respuesta privada vía
`POST /{comment-id}/private_replies`.

## Lo que NO se pide en esta fase

- Publicación de contenido (posts, stories) en ninguno de los dos canales.
- Acceso a anuncios (`ads_management`, etc.).
- Permisos de página más allá de mensajería/comentarios (no se lee el
  catálogo de productos de la Page, ni analytics, ni configuración).
- TikTok: fuera de esta fase (ver `docs/meta-channel-onboarding.md`,
  "ACCION MANUAL TIKTOK REQUERIDA").

## Estado de las capacidades "beta" de Instagram

`LIVE_COMMENT_TRIGGER`, `FOLLOW_TRIGGER`, `SHARE_TRIGGER` y `AD_TRIGGER`
existen en la matriz de capacidades (`src/lib/channels/capabilities.ts`)
como `PREPARED_BUT_EXTERNAL_APPROVAL` — no se piden scopes para ellas en
esta fase y la UI no las ofrece como activas hasta que una conexión real
confirme acceso explícito. No se anuncian ni se prueban en el Review de los
tres scopes de arriba.

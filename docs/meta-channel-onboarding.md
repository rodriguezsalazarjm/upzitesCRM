# Upzites Flow: autorización de canales Meta

Decisión C2 · 16 septiembre 2026 · preparación local, sin conexión API real.

## Decisión

Instagram usará **Instagram API with Instagram Login** como camino preferido para el SaaS. No exige una Página Facebook vinculada. Messenger usa una Página Facebook y conserva un proceso independiente. Facebook Login para Instagram queda representado como alternativa compatible, no como requisito del onboarding principal.

| Aspecto | Instagram Login | Instagram con Facebook Login | Messenger |
| --- | --- | --- | --- |
| Cuenta | Instagram profesional, Business o Creator | Instagram profesional vinculada a una Página | Facebook Page |
| Autorización | Business Login for Instagram | Facebook Login | Facebook Login y selección de Página |
| Token de envío | Instagram User Access Token | Page Access Token | Page Access Token |
| Host | graph.instagram.com | graph.facebook.com | graph.facebook.com |
| Identidad | Instagram account ID + Instagram-scoped recipient | IG account y Página vinculada | Page ID + PSID |
| Página obligatoria | No | Sí | Sí |
| Permisos básicos del caso de uso | instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments | instagram_basic, instagram_manage_messages, instagram_manage_comments; permisos pages según operación | pages_messaging; pages_show_list para selección, pages_manage_metadata para suscripción, pages_read_engagement según lectura |

## Acceso y revisión

El acceso a cuentas/clientes externos requiere la revisión y Advanced Access correspondientes. Los roles de desarrollo permiten pruebas restringidas; no prueban autorización productiva. Verificación del negocio, permisos concedidos, suscripciones y renovación de tokens deben verificarse por conexión. No pedir permisos de publicación de contenido si solo se usan mensajes/comentarios.

## Mensajes, comentarios y webhooks

Instagram Login mantiene las operaciones de mensajes y comentarios bajo su familia de permisos `instagram_business_*`. La respuesta privada a un comentario es una operación distinta de enviar un DM ordinario: debe conservar el ID del comentario y respetar las restricciones de la API. No se asume que comentar abre una ventana ilimitada de mensajería ni que habilita follow-ups arbitrarios.

Instagram con Facebook Login conserva sus permisos `instagram_*` y su contexto de Página. Messenger envía como Página; no usa tokens Instagram ni sus scopes. La ventana estándar de Messenger es de 24 horas desde el mensaje del usuario, salvo mecanismos expresamente autorizados.

Los webhooks requieren callback HTTPS, verificación de suscripción, validación de firma y suscripción de la cuenta/Página a los campos correspondientes. Los adaptadores normalizan después el evento. App Secret, helpers de firma y gateway pueden compartirse; identidad, mecanismo, token, scopes y suscripciones se almacenan por cuenta. Un estado CONNECTED en demo no acredita suscripción real.

FOLLOW/SHARE/LIVE y TikTok no se habilitan por mera existencia de un contrato. Requieren capabilities efectivas confirmadas. No inventar scopes TikTok ni presentar un botón productivo mientras falte acceso a Business Messaging.

## Contrato local

`meta/auth-strategy.ts` discrimina INSTAGRAM_LOGIN y FACEBOOK_LOGIN. La metadata de ChannelAccount registra el mecanismo, tipo de token y Page ID cuando corresponde. No se infiere por ser un canal Meta. Las cuentas demo se identifican como fake y solo se pueden crear dentro del runtime local protegido. No se guardan tokens reales en ese flujo.

La preparación de screencasts utiliza conexión demo → Inbox → automatización → respuesta y trazas del Run. Debe rotularse **demostración simulada**; no es evidencia de llamadas exitosas a Meta ni reemplaza App Review. Las instrucciones operativas para cuentas reales se entregan después de completar y verificar C2.

## Fuentes oficiales consultadas

El portal developers.facebook.com respondió HTTP 429 durante esta sesión. Se contrastó con las colecciones publicadas por **Meta** en Postman, no con artículos de terceros:

- [Instagram API, colección oficial Meta](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00): cuenta profesional, ausencia de requisito de Página en Instagram Login y separación de tokens.
- [Instagram API, documentación oficial Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api): permisos instagram_business, mensajes y ejemplos graph.instagram.com.
- [Messenger Send API, Meta](https://www.postman.com/meta/messenger-platform-api/folder/7cc3gd2/send-api): Page token, pages_messaging y ventana de mensajes.
- [Conversations API, Meta](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a): scopes de Página y Advanced Access.
- Rutas canónicas para reverificar antes de habilitar producción: [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/), [Messenger](https://developers.facebook.com/docs/messenger-platform/).

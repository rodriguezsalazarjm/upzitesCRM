# Contexto y plan de ejecucion - CRM Upzites

---

## Protocolo de relevo (Claude / Codex)

Este proyecto lo trabajan de forma alternada distintos agentes (Claude y Codex)
y el usuario. Para no perder continuidad entre sesiones, todo agente DEBE seguir
este protocolo de relevo.

### Reglas

1. **Al iniciar** una sesion de trabajo: leer la entrada mas reciente de la
   "Bitacora de relevo" (justo abajo) y la seccion "Estado vivo del proyecto".
   No empezar a editar sin saber que dejo pendiente el turno anterior.
2. **Al terminar** una sesion en la que se hayan tocado archivos: agregar una
   entrada NUEVA al inicio de la bitacora (orden invertido, lo mas reciente
   arriba) y actualizar "Estado vivo del proyecto" si cambio el foco.
3. La **fecha y hora** se registran en hora de Chile, formato `YYYY-MM-DD HH:MM`.
4. Una entrada por sesion. Si se retoma el mismo dia, se puede agregar otra.
5. Mantener las entradas **cortas y verificables**: que se hizo, que archivos,
   que quedo pendiente. No copiar codigo aqui.
6. Si una decision contradice este plan, documentarla en la bitacora con su
   motivo antes de aplicarla.

### Formato de entrada

```
### [YYYY-MM-DD HH:MM] - <agente: claude | codex | usuario>
- Foco: <bloque/fase o tarea en la que se trabajo>
- Cambios: <que se hizo, en 1-3 lineas>
- Archivos: <rutas principales tocadas>
- Estado: <terminado | en progreso | bloqueado>
- Siguiente: <proximo paso concreto para quien retome>
- Bloqueos: <insumos o decisiones que faltan, o "ninguno">
```

### Estado vivo del proyecto

- **Fase actual:** Fase 0 (estabilizar base) en transicion a Bloque A (deploy
  Vercel + Supabase). CRM ya tiene CRUD, auth, captura web y modulos base.
- **Foco inmediato sugerido:** segun "Orden recomendado de implementacion":
  1) deploy Vercel+Supabase, 2) pagina `/contacto` avanzada, 3) Resend.
- **Pendiente transversal:** Meta Pixel YA portado a `apps/web` (sesion
  2026-06-16). Falta commitear/pushear y, cuando la version pro este lista,
  decidir como reemplaza a la web operativa en Vercel.
- **GitHub:** el monorepo vive en el repo `upzitesCRM` (remoto `origin`),
  pusheado y sincronizado. El repo `upzites` (remoto `upzites`) es el original
  y probablemente el conectado al Vercel operativo (master en `2e7fad2`).
- **Insumos bloqueantes:** ver "Insumos pendientes del usuario" al final del doc
  (API keys de OpenAI/Resend, Supabase prod, accesos Meta/WhatsApp, Cal.com).

### Bitacora de relevo

### [2026-06-16 13:35] - claude
- Foco: portar la integracion del Meta Pixel desde `upzites-vercel-pixel` a
  `apps/web` (version pro, reemplazando la version simple previa).
- Cambios: copiados `lib/meta-pixel.ts`, `components/MetaPixel.tsx` (script en
  <head> + noscript), `MetaPixelPageView.tsx` (PageView en navegacion SPA) y
  `MetaPixelEvents.tsx` (ViewContentOnLoad). Cableado en `layout.tsx`. Eventos
  estandar adaptados a la estructura actual: ViewContent en home/nosotros/
  proyectos, Contact en FloatingActions y PromoPopup (WhatsApp/email), Schedule
  en ScheduleMeeting, Lead en BigCTA, CompleteRegistration en newsletter del
  Footer. CSP de `next.config.ts` ajustado para el Event Setup Tool de Meta
  (frame-ancestors + se quitaron X-Frame-Options y COOP). `.env.example` con
  vars de pixel. Verificado: `tsc --noEmit` y `lint` en 0 errores; el HTML
  servido renderiza el script, init, PageView y noscript.
- Archivos: apps/web/{lib/meta-pixel.ts, components/MetaPixel*.tsx,
  app/layout.tsx, app/page.tsx, app/nosotros/page.tsx, app/proyectos/page.tsx,
  components/{FloatingActions,PromoPopup,ExtraSections,Sections}.tsx,
  next.config.ts, .env.example}.
- Estado: terminado (sin commitear).
- Siguiente: commitear+pushear a `upzitesCRM`; decidir descarte de
  `upzites-vercel-pixel` y docs redundantes; en BriefForms (server component,
  ahora links internos a /brief/*) ubicar un evento Lead en la pagina del brief
  si se quiere medir esa conversion.
- Bloqueos: definir el ID real de pixel por env (`NEXT_PUBLIC_META_PIXEL_ID`)
  en Vercel; hoy usa el fallback `1009533758712390`.

### [2026-06-16 13:18] - claude
- Foco: contexto inicial + diseno del protocolo de relevo.
- Cambios: revisada la estructura del monorepo, los repos, contexto.md,
  contexto2.md y contextocrm.md. Confirmado que el monorepo es el proyecto
  avanzado y que `upzites-vercel-pixel` solo aporta la integracion del Meta
  Pixel. Creada esta seccion de protocolo de relevo + bitacora.
- Archivos: contexto.md.
- Estado: terminado.
- Siguiente: definir con el usuario el primer bloque a ejecutar (deploy o
  `/contacto`) y/o portar el Meta Pixel a `apps/web`.
- Bloqueos: faltan insumos del usuario (API keys, Supabase prod, accesos Meta).

---

## Version actual

Esta version del proyecto contiene el CRM integrado dentro del monorepo.

- `apps/web`: sitio principal de Upzites.
- `apps/crm`: aplicacion CRM inicial.
- `docs/crm-legacy`: referencia estrategica y tecnica del CRM anterior.
- Anexo A (al final de este doc): vision extendida, arquitectura y roadmap.

El foco inmediato es convertir el CRM desde una interfaz con datos mock hacia un MVP funcional con persistencia, autenticacion y captura de leads desde sitios web.

## Objetivo del MVP

El MVP debe demostrar una promesa principal:

"Cada lead que entra desde tu sitio queda ordenado, asignado, seguido y conectado a ventas reales."

No se busca competir por paridad con HubSpot, Odoo o Salesforce. El diferencial inicial es la conexion nativa entre sitio web, lead, seguimiento comercial y atribucion para clientes Upzites.

## Plan de ejecucion

### Fase 0: estabilizar la base tecnica

Objetivo: dejar el monorepo listo para desarrollo continuo.

Tareas:

- Revisar scripts principales del monorepo.
- Corregir `lint` en `apps/crm`.
- Corregir errores actuales de ESLint en `apps/web`.
- Alinear dependencias React, Next y tipos entre apps.
- Revisar `.gitignore` y archivos de entorno.
- Reparar textos visibles con problemas de encoding si aparecen.
- Documentar comandos de desarrollo en `README.md`.

Criterio de termino:

- `pnpm install` no rompe el lockfile.
- `pnpm lint` pasa o deja reglas acordadas.
- `pnpm build` pasa para las apps principales.
- El equipo sabe correr `apps/web` y `apps/crm`.

### Fase 1: persistencia del CRM

Objetivo: reemplazar datos mock por datos reales en Supabase Postgres.

Estado actual:

- Backend inicial elegido: API dentro de `apps/crm` para acelerar el MVP.
- ORM elegido: Prisma.
- Supabase Postgres definido como base de datos objetivo.
- `DATABASE_URL` definido para pooler de Supabase en runtime.
- `DIRECT_URL` definido para migraciones y seed.
- Schema inicial creado en `apps/crm/prisma/schema.prisma`.
- Migracion inicial creada en `apps/crm/prisma/migrations`.
- Seed demo creado en `apps/crm/prisma/seed.ts`.
- Dashboard, contactos, oportunidades y actividades leen desde Prisma.
- Endpoints CRUD iniciales creados para contactos, oportunidades y actividades.

Tareas:

- Decidir backend inicial: API dentro de `apps/crm` o app separada `apps/api`. Hecho: API dentro de `apps/crm`.
- Elegir ORM: Prisma o Drizzle. Hecho: Prisma.
- Configurar PostgreSQL en Supabase. Hecho como infraestructura objetivo.
- Crear schema inicial. Hecho.
- Crear migraciones versionadas. Hecho.
- Crear seed demo. Hecho.
- Implementar CRUD de contactos. Hecho en API inicial.
- Implementar CRUD de oportunidades. Hecho en API inicial.
- Implementar actividades y notas simples. Hecho en API inicial.
- Conectar dashboard a datos reales. Hecho.

Criterio de termino:

- El CRM lista datos desde la base de datos.
- Se pueden crear, editar y eliminar contactos.
- Se pueden crear y mover oportunidades por etapa.
- El dashboard calcula KPIs desde la DB.

### Fase 2: autenticacion y workspaces

Objetivo: convertir el demo en una base usable por clientes.

Estado actual:

- Login real implementado con `/api/auth/login`.
- Logout implementado con `/api/auth/logout`.
- Sesion HTTP-only firmada con `CRM_SESSION_SECRET`.
- Passwords hasheadas con PBKDF2.
- Usuarios asociados a workspace.
- Roles iniciales disponibles: `OWNER`, `ADMIN`, `SALES`.
- Rutas del dashboard protegidas desde `apps/crm/src/app/(dashboard)/layout.tsx`.
- APIs de contactos, oportunidades y actividades operan sobre el workspace del usuario autenticado.
- Recuperacion de contrasena preparada con tabla `password_reset_tokens` y endpoint inicial `/api/auth/password-reset`.

Tareas:

- Implementar login real. Hecho.
- Crear modelo de usuarios. Hecho.
- Crear modelo de workspaces. Hecho.
- Asociar contactos, oportunidades y actividades a `workspace_id`. Hecho.
- Agregar roles iniciales: `owner`, `admin`, `sales`. Hecho como `OWNER`, `ADMIN`, `SALES`.
- Proteger rutas del CRM. Hecho.
- Preparar recuperacion de contrasena. Hecho en base inicial.

Criterio de termino:

- Cada workspace ve solo sus datos.
- Los usuarios tienen roles basicos.
- El CRM deja de depender de usuarios hardcodeados.

## Infraestructura oficial

Estado actual:

- Deploy definido en Vercel.
- Base de datos definida en Supabase Postgres.
- `apps/web` y `apps/crm` se despliegan como proyectos Vercel separados.
- Prisma usa `DATABASE_URL` para runtime y `DIRECT_URL` para migraciones.
- Guia operativa creada en `docs/deploy-vercel-supabase.md`.

Comandos principales:

```bash
pnpm --filter @upzites/crm db:deploy
pnpm --filter @upzites/crm db:seed
```

Docker queda solo como alternativa local opcional.

## Nuevo objetivo producto: web + CRM + automatizaciones comerciales

El producto ya no debe tratarse solo como "web con CRM integrado". El objetivo es construir un sistema comercial empaquetable:

Sitio web -> contacto avanzado -> CRM -> WhatsApp -> IA vendedora -> agenda -> seguimiento -> venta.

El CRM debe poder venderse como producto separado, aunque al inicio funcione como valor agregado de los proyectos web de Upzites. La promesa comercial debe ser:

"No solo vendemos una web bonita; entregamos un sistema que captura leads, organiza el negocio, automatiza seguimiento y ayuda a cerrar ventas."

El CRM debe adaptarse a muchos nichos de mercado: servicios profesionales, salud, inmobiliarias, educacion, comercio, restaurantes, consultorias, turismo, industria local y otros verticales.

### Plan de ejecucion actualizado

#### Bloque A: deploy productivo en Vercel + Supabase

Objetivo: dejar `apps/web` y `apps/crm` corriendo en produccion.

Tareas:

- Crear proyecto Supabase productivo.
- Configurar `DATABASE_URL` con pooler de Supabase para runtime en Vercel.
- Configurar `DIRECT_URL` para migraciones y seed.
- Crear proyectos Vercel separados para `apps/web` y `apps/crm`.
- Configurar variables de entorno en Vercel.
- Definir dominios: sitio publico y CRM, por ejemplo `upzites.cl` y `crm.upzites.cl` o `app.upzites.cl`.
- Ejecutar migraciones contra Supabase con `pnpm --filter @upzites/crm db:deploy`.
- Ejecutar seed inicial con `pnpm --filter @upzites/crm db:seed`.
- Validar login, dashboard, captura web y paginas principales en produccion.

Criterio de termino:

- Web publica desplegada.
- CRM desplegado.
- Supabase conectado.
- Login productivo funcionando.
- Datos del CRM persistiendo en Supabase.

#### Bloque B: pagina Contacto avanzada

Objetivo: crear una pagina `/contacto` separada y orientada a conversion.

Campos recomendados:

- Nombre.
- Email.
- Telefono.
- WhatsApp.
- Empresa.
- Rubro o nicho.
- Tipo de servicio requerido.
- Presupuesto aproximado.
- Urgencia.
- Mensaje.
- Consentimiento de tratamiento de datos.

Comportamiento esperado:

- Capturar UTM, pagina de origen, referrer y fuente.
- Crear o actualizar contacto en el CRM.
- Crear `form_submission`.
- Crear actividad en el timeline.
- Crear oportunidad si el lead cumple condiciones minimas.
- Enviar correo automatico al usuario usando Resend.
- Enviar notificacion interna a Upzites.

Texto base del correo automatico:

"Hola, hemos recibido tu solicitud con exito. El equipo de Upzites revisara la informacion y te contactara a la brevedad para avanzar con el siguiente paso."

Requisitos adicionales:

- Usar Resend como proveedor de email transaccional.
- Agregar proteccion anti-spam: Turnstile, reCAPTCHA o honeypot.
- Preparar plantillas de email por workspace a futuro.

Criterio de termino:

- Todo formulario enviado desde `/contacto` queda registrado en el CRM.
- El usuario recibe correo automatico.
- Upzites recibe alerta interna.
- La fuente del lead queda trazable.

#### Bloque C: captura de leads por WhatsApp

Objetivo: que el CRM capture tanto clicks al boton de WhatsApp como conversaciones entrantes reales.

Nivel 1: click en boton WhatsApp.

- Registrar evento `WHATSAPP_CLICK`.
- Capturar URL, UTM, referrer y pagina.
- Asociar al contacto si existe identificacion previa.
- Crear evento anonimo si aun no existe contacto.

Nivel 2: mensaje entrante por WhatsApp Business Cloud API.

- Configurar Meta Business Manager.
- Configurar WhatsApp Business Account.
- Configurar numero de WhatsApp Business.
- Crear webhook para mensajes entrantes.
- Crear o actualizar contacto desde el telefono.
- Guardar conversacion en CRM.
- Crear actividad de conversacion.

Criterio de termino:

- Los clicks al boton de WhatsApp aparecen en fuentes/eventos.
- Los mensajes entrantes crean o actualizan contactos.
- Cada conversacion queda asociada a un workspace.

#### Bloque D: chatbot IA vendedor para WhatsApp

Objetivo: automatizar el primer contacto comercial con IA.

Comportamiento esperado:

- Responder como asesor comercial de Upzites o del workspace correspondiente.
- Calificar necesidad, urgencia, presupuesto y tipo de servicio.
- Detectar intencion de compra.
- Recomendar siguiente paso.
- Agendar reunion presencial o llamada cuando corresponda.
- Registrar resumen comercial en el CRM.
- Crear tarea para humano si la conversacion requiere intervencion.

Reglas importantes:

- No prometer precios finales sin validacion humana si no estan definidos.
- No inventar disponibilidad de agenda.
- Respetar ventana de atencion y templates de WhatsApp.
- Escalar a humano cuando el usuario lo pida o cuando haya dudas.
- Guardar prompt, respuesta, estado y trazabilidad por conversacion.

Criterio de termino:

- Un lead que escribe por WhatsApp puede ser atendido automaticamente.
- El bot puede calificar y avanzar hacia reunion.
- El CRM guarda contacto, conversacion, resumen y tareas.

#### Bloque E: integracion con Cal.com

Objetivo: permitir que el bot o el CRM agenden reuniones automaticamente.

Tareas:

- Configurar cuenta Cal.com.
- Obtener API key u OAuth.
- Definir `eventTypeId` para reuniones comerciales.
- Configurar horarios, zona horaria y modalidad: presencial, llamada o videollamada.
- Crear endpoint interno para generar bookings.
- Guardar booking como actividad/reunion en CRM.
- Asociar booking a contacto y oportunidad.

Criterio de termino:

- El bot puede proponer horarios disponibles.
- Una reunion aceptada queda creada en Cal.com.
- La reunion queda registrada en el CRM.

#### Bloque F: limpieza de web publica

Objetivo: reducir peso y mejorar foco comercial.

Tareas:

- Eliminar seccion "Audita tu web".
- Eliminar imports, componentes y assets no usados relacionados con esa seccion.
- Revisar bundle despues del cambio.
- Mantener el CTA principal hacia contacto/WhatsApp.

Criterio de termino:

- La web queda mas liviana.
- No queda codigo muerto de esa seccion.

#### Bloque G: hub de integraciones del CRM

Objetivo: mejorar `/integraciones` para que sea una base extensible de producto.

Categorias iniciales:

- Comunicacion: WhatsApp, Instagram, Messenger, Gmail.
- Calendario: Google Calendar, Cal.com.
- Email: Resend, Mailchimp, Brevo.
- Pagos: Stripe, Mercado Pago, Transbank, Khipu.
- Ads y analytics: Google Ads, Meta Ads, Google Analytics, Search Console.
- Formularios: Typeform, Tally, Google Forms.
- Ecommerce: Shopify, WooCommerce.
- Automatizacion externa: Zapier, Make, n8n.
- Soporte y equipos: Slack, Discord.
- CRM externo: HubSpot, Pipedrive.

Estados de conexion:

- Conectado.
- Requiere atencion.
- Desconectado.
- Proximamente.

Capacidades esperadas:

- Conectar por OAuth, API key o webhook segun proveedor.
- Probar conexion.
- Ver ultimo sync.
- Ver logs por integracion.
- Guardar credenciales cifradas.
- Definir permisos por workspace.
- Permitir integraciones futuras sin redisenar la base.

Criterio de termino:

- La seccion integraciones deja de ser una lista estatica.
- Cada proveedor tiene ficha, estado, configuracion y acciones.
- La arquitectura soporta nuevas herramientas por conector.

### Insumos pendientes del usuario

Faltan estos accesos o decisiones para completar el objetivo:

- OpenAI API key.
- Resend API key.
- Dominio verificado en Resend.
- Email remitente, por ejemplo `Upzites <contacto@upzites.cl>`.
- Email interno para recibir alertas.
- Proyecto Supabase productivo.
- `DATABASE_URL` pooler de Supabase.
- `DIRECT_URL` de Supabase.
- Acceso a Vercel o proyecto conectado al repositorio.
- Dominios definitivos para web y CRM.
- Acceso DNS del dominio.
- Meta Business Manager.
- WhatsApp Business Account.
- Numero de WhatsApp Business.
- Phone Number ID.
- WhatsApp access token.
- WhatsApp webhook verify token.
- Meta app secret.
- Templates aprobados para WhatsApp fuera de la ventana de atencion.
- Cuenta Cal.com.
- Cal.com API key u OAuth.
- Event type de Cal.com para reuniones.
- Horarios y modalidad de reunion.
- Politica de privacidad.
- Texto de consentimiento para formularios.
- Prompt base comercial del bot.
- Lista de servicios, precios orientativos, objeciones frecuentes y reglas de escalamiento a humano.

### Orden recomendado de implementacion

1. Deploy base Vercel + Supabase.
2. Pagina `/contacto` avanzada.
3. Email automatico con Resend.
4. Captura de clicks WhatsApp.
5. Eliminacion de "Audita tu web".
6. Mejora de `/integraciones` como hub extensible.
7. WhatsApp Business Cloud API con webhooks.
8. Bot IA vendedor.
9. Integracion Cal.com.
10. Endurecimiento multi-nicho, permisos, logs, limites y billing.

### Dos lineas de trabajo desde `contexto2.md`

El proyecto queda dividido en dos carriles paralelos para evitar mezclar producto operativo con comunicacion comercial.

#### Linea 1: operativa y funcionalidades

Objetivo: construir el sistema que captura, organiza y automatiza oportunidades comerciales.

Alcance:

- Deploy productivo en Vercel + Supabase.
- Pagina `/contacto` avanzada conectada al CRM.
- Captura de formularios, UTMs, fuentes y eventos.
- Correo automatico con Resend.
- Captura de clicks de WhatsApp.
- Webhooks de WhatsApp Business Cloud API.
- Chatbot IA vendedor conectado al CRM.
- Agenda automatica con Cal.com.
- Hub de integraciones extensible.
- CRM multi-nicho, empaquetable y vendible como producto separado.

Prioridad inmediata:

1. Supabase + Vercel productivo.
2. Formulario `/contacto` avanzado.
3. Resend.
4. Tracking de WhatsApp clicks.
5. Integraciones como hub.

#### Linea 2: frontend web servicios

Objetivo: actualizar la web publica para comunicar el nuevo ecosistema UPZITES.

Nueva promesa:

"Creamos marcas, webs y contenido que conectan, venden y crecen."

Servicios principales:

- Branding y Direccion Visual.
- Diseno y Desarrollo Web.
- E-commerce, catalogos y sistemas de venta.
- Marketing Digital y Contenido.
- Ads y Performance.
- Apps Moviles.
- Automatizacion e Inteligencia Artificial.

Regla estrategica:

- No se elimina ningun servicio existente de UPZITES.
- Los servicios actuales se actualizan y se conectan con la nueva linea del socio estrategico.
- El nuevo socio fortalece especialmente contenido, fotografia, video, redes, creatividades y performance.

Soluciones Express:

- Invitaciones Digitales.
- Reel Express 24H.
- Landing Express.
- Catalogo Web Express.
- Carta QR Restaurante.
- Album QR en Vivo como add-on de eventos.

Acciones inmediatas:

- Eliminar la seccion "Audita tu web" de la home.
- Quitar la navegacion hacia `#auditoria`.
- Actualizar la estructura de servicios.
- Crear seccion "Soluciones Express" en home y pagina de servicios.
- Preparar CTAs configurables para landings futuras sin hardcodear dominios.
- Separar visualmente servicios premium de soluciones express.
- Incorporar Metodo MARCA como marco de trabajo.

### Fase 3: captura web basica

Objetivo: recibir leads desde sitios externos o desde sitios creados por Upzites.

Estado actual:

- Workspace tiene `public_key` para captura publica.
- Modelo de eventos web creado con `web_events`.
- Modelo de formularios creado con `forms` y `form_submissions`.
- Endpoint publico de eventos creado en `/api/capture/events`.
- Snippet instalable creado en `/api/capture/snippet?key=PUBLIC_KEY`.
- Formulario embebible creado en `/api/capture/forms/[publicId]`.
- Submissions de formularios crean/actualizan contacto, registran submission, actividad y evento `FORM_SUBMIT`.
- Vista de fuentes creada en `/fuentes`.
- Configuracion muestra snippet e iframe para instalar en sitios externos.

Tareas:

- Crear endpoint publico para eventos web. Hecho.
- Crear snippet JS instalable. Hecho.
- Registrar page views, CTA clicks y form submits. Hecho.
- Capturar URL, referrer y parametros UTM. Hecho.
- Crear formularios embebibles basicos. Hecho.
- Convertir submissions en contactos. Hecho.
- Asociar fuente, campana y pagina al lead. Hecho.
- Crear vista de fuentes de leads. Hecho.

Criterio de termino:

- Un sitio externo puede enviar un lead al CRM.
- El contacto muestra de que URL, formulario y campana vino.

### Fase 4: operacion comercial

Objetivo: hacer que el CRM sea util para un equipo de ventas real.

Estado actual:

- Pipeline lee etapas desde la base de datos.
- APIs de configuracion de etapas creadas en `/api/pipeline-stages`.
- Vista Kanban de oportunidades conectada a etapas configurables.
- Vista tabla de oportunidades existente.
- Contactos tienen busqueda y filtros por estado.
- Exportacion CSV de contactos creada en `/api/contacts/export`.
- Importacion CSV de contactos creada en `/api/contacts/import`.
- Ficha completa de contacto creada en `/contactos/[id]`.
- Timeline de contacto muestra actividades, tareas pendientes y eventos web.
- Actividades muestran tareas pendientes cuando tienen fecha de vencimiento.

Tareas:

- Crear pipeline configurable. Hecho en API inicial y conectado a la vista.
- Crear vista Kanban de oportunidades. Hecho.
- Crear vista tabla avanzada de contactos. Parcial: tabla con filtros y busqueda.
- Agregar busqueda y filtros. Hecho en contactos.
- Crear tareas y recordatorios. Hecho en actividades con `dueAt`.
- Crear timeline completo por contacto. Hecho en ficha de contacto.
- Agregar importacion CSV. Hecho en API.
- Agregar exportacion CSV. Hecho en API y UI.

Criterio de termino:

- Un vendedor puede gestionar su dia dentro del CRM.
- Un responsable puede ver oportunidades activas, tareas y seguimiento.

### Fase 5: integraciones clave

Objetivo: conectar los canales donde ocurre la venta.

Estado actual:

- Modelo `integrations` creado.
- API `/api/integrations` creada.
- Pantalla `/integraciones` creada.
- Seed demo incluye WhatsApp, Calendar, Gmail, Transbank, Mercado Pago y Khipu.

Prioridad:

1. WhatsApp.
2. Google Calendar.
3. Email transaccional o Gmail.
4. Transbank, Mercado Pago o Khipu.
5. Google Analytics, Search Console o Google Ads.

Criterio de termino:

- El CRM puede registrar conversaciones, reuniones y conversiones relevantes.
- Los pagos o conversiones pueden conectarse a oportunidades.

### Fase 6: automatizaciones e IA

Objetivo: reducir trabajo manual y aumentar valor percibido.

Estado actual:

- Modelo `automation_rules` creado.
- Modelo `ai_insights` creado.
- Pantalla `/automatizaciones` creada.
- Pantalla `/insights` creada.
- API `/api/automations/run` crea tareas/insights para contactos sin actividad.
- API `/api/ai/insights/generate` genera lead scoring basico.

Tareas:

- Crear reglas simples tipo "si pasa X, hacer Y".
- Crear recordatorios automaticos.
- Crear scoring basico de leads.
- Crear resumen de contacto.
- Sugerir siguiente mejor accion.
- Crear plantillas de respuesta.

Criterio de termino:

- El CRM recomienda acciones utiles y automatiza seguimiento basico.

### Fase 7: piloto comercial y monetizacion

Objetivo: dejar el CRM listo para pilotos pagables y control de limites.

Estado actual:

- Modelos `subscription_plans` y `workspace_subscriptions` creados.
- Pantalla `/billing` creada.
- API mock `/api/billing/checkout` creada.
- Seed demo incluye plan piloto.

### Fase 8: operacion, auditoria y salud

Objetivo: preparar el producto para operar con trazabilidad basica.

Estado actual:

- Modelo `audit_logs` creado.
- Pantalla `/ops` creada.
- Endpoint `/api/system/health` creado.
- Seed demo incluye logs iniciales.

## Orden inmediato recomendado

1. Ejecutar revision tecnica de Fase 0.
2. Corregir lint/build del monorepo.
3. Decidir backend inicial y ORM.
4. Crear PostgreSQL local.
5. Modelar contactos, oportunidades y actividades.
6. Reemplazar mocks principales por datos persistentes.
7. Implementar autenticacion real.
8. Crear captura web basica.

## Decisiones pendientes

- Backend: `apps/api` con NestJS o API dentro de `apps/crm`.
- ORM: Prisma o Drizzle.
- Auth: Auth.js, Clerk, Supabase o backend propio.
- Hosting: Vercel para `apps/web` y `apps/crm`.
- Base de datos: Supabase Postgres.
- Primer nicho comercial: servicios profesionales, salud, inmobiliario, educacion o comercio especializado.
- Modelo de precios: por workspace, por usuario, por automatizaciones o incluido en mantenimiento web.


---

# Anexo A - Vision y arquitectura de producto (CRM)

> Consolidado desde contextocrm.md el 2026-06-16. Documento unico maestro.
# Contexto CRM Upzites

## Proposito del sistema

Upzites CRM sera una plataforma web-first para gestionar el crecimiento comercial de pymes que ya tienen, o estan por lanzar, un sitio web. La oportunidad no es copiar un CRM generico, sino conectar el recorrido completo:

Sitio web -> lead -> conversacion -> agenda -> cotizacion -> pago -> atribucion.

El producto debe venderse como una extension natural de los proyectos de Upzites: sitio + CRM + automatizaciones + reportes de ingresos.

## Estado actual del repositorio

El proyecto vive en un monorepo con pnpm y Turborepo.

- `apps/web`: sitio principal de Upzites, construido con Next.js 16, React 19 y Tailwind CSS 4.
- `apps/crm`: frontend inicial del CRM, construido con Next.js 16, React, Tailwind y componentes tipo shadcn/ui.
- `docs/crm-legacy`: referencia anterior con backend NestJS, Drizzle, arquitectura y documentacion estrategica.

El CRM actual ya tiene:

- Login visual con demo.
- Layout de dashboard con sidebar y header.
- Dashboard con KPIs.
- Modulos visuales para contactos, oportunidades, actividades y configuracion.
- Datos mock en `apps/crm/src/lib/mock-data.ts`.

El CRM actual todavia no tiene:

- Autenticacion real.
- Base de datos conectada.
- Backend integrado al monorepo activo.
- Multi-tenant/workspaces.
- API real para contactos, oportunidades y actividades.
- Captura web por snippet.
- Integraciones con WhatsApp, correo, calendario o pagos.
- Automatizaciones.
- Tests.

## Vision de producto

El CRM debe ayudar a una pyme a saber que oportunidades tiene, de donde vienen, que acciones faltan y que canales estan generando ingresos reales.

La promesa principal:

"Convierte tu sitio web en un sistema comercial conectado: captura leads, centraliza conversaciones, agenda, cotiza, cobra y mide que genera ventas."

## Usuarios objetivo

### Dueno o gerente

Necesita ver ingresos, oportunidades abiertas, fuentes de leads, pagos pendientes y rendimiento de campanas.

### Vendedor o ejecutivo comercial

Necesita ver tareas del dia, contactos pendientes, conversaciones recientes, oportunidades por cerrar y recordatorios.

### Administrador

Necesita configurar usuarios, permisos, pipelines, formularios, integraciones, automatizaciones y campos personalizados.

## Diferenciacion

El CRM debe diferenciarse por:

- Conexion nativa con sitios web creados por Upzites.
- Implementacion rapida para pymes chilenas.
- Integraciones locales de pago como Transbank, Mercado Pago y Khipu.
- Atribucion clara: pagina/campana/formulario -> lead -> venta -> pago.
- Automatizaciones simples y practicas, no una suite pesada.
- UX limpia, operacional y facil de adoptar.

## Arquitectura objetivo

### Frontend

- Next.js 16.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- Componentes propios basados en patrones shadcn/ui.
- TanStack Query para server state.
- Zustand o React Context solo para estado local/global simple.

### Backend

Opcion recomendada: monolito modular API-first.

- Node.js LTS.
- NestJS + Fastify.
- Zod para validacion de contratos.
- OpenAPI para documentar endpoints.
- Autenticacion con JWT/session segura.
- Modulos separados por dominio.

Modulos iniciales:

- Auth.
- Workspaces.
- Users.
- Contacts.
- Companies.
- Opportunities.
- Activities.
- Webhooks.
- Forms.
- Integrations.

### Base de datos

- PostgreSQL como base transaccional principal.
- Drizzle ORM o Prisma, elegir una sola capa y mantenerla consistente.
- Row-Level Security o controles estrictos por `workspace_id`.
- Migraciones versionadas.

Tablas base:

- `workspaces`
- `users`
- `workspace_members`
- `contacts`
- `companies`
- `opportunities`
- `pipeline_stages`
- `activities`
- `lead_sources`
- `forms`
- `form_submissions`
- `web_events`
- `integrations`
- `automation_rules`

### Analytics y eventos

Primera etapa:

- Guardar eventos web basicos en PostgreSQL.

Etapa posterior:

- Separar analytics hacia ClickHouse si el volumen crece.

Eventos relevantes:

- Page view.
- Form submit.
- CTA click.
- WhatsApp click.
- Meeting booked.
- Quote sent.
- Payment link opened.
- Payment confirmed.

### Automatizaciones

Primera etapa:

- Automatizaciones simples basadas en reglas.

Ejemplos:

- Si entra un lead desde formulario, crear contacto y oportunidad.
- Si una oportunidad cambia a propuesta, crear tarea de seguimiento.
- Si no hay actividad en 3 dias, generar recordatorio.
- Si se confirma pago, mover oportunidad a ganada.

Etapa posterior:

- Temporal o motor durable para workflows largos.

## Roadmap recomendado

### Fase 0: ordenar base tecnica

Objetivo: dejar el repo listo para desarrollo continuo.

Tareas:

- Corregir script de lint en `apps/crm`.
- Alinear versiones de React y `@types/react`.
- Excluir carpetas de referencia del lint si corresponde.
- Corregir errores actuales de ESLint en `apps/web`.
- Reparar textos con mojibake en contenido visible.
- Definir variables de entorno por app.
- Crear README real para el monorepo.

Criterio de termino:

- `pnpm build` pasa.
- `pnpm lint` pasa o tiene reglas acordadas.
- El equipo sabe como correr `web` y `crm`.

### Fase 1: MVP CRM local con persistencia

Objetivo: reemplazar datos mock por datos reales.

Tareas:

- Crear backend activo o API routes iniciales.
- Definir schema de base de datos.
- Configurar Supabase Postgres como base de datos del CRM.
- Implementar migraciones.
- Crear CRUD de contactos.
- Crear CRUD de oportunidades.
- Crear actividades/notas.
- Conectar dashboard a API real.
- Crear seed demo.

Criterio de termino:

- El usuario puede iniciar sesion demo.
- Puede crear, editar y listar contactos.
- Puede crear oportunidades y moverlas por etapa.
- El dashboard muestra datos reales desde DB.

### Fase 2: autenticacion y multi-workspace

Objetivo: convertir el demo en producto usable por clientes.

Tareas:

- Implementar login real.
- Crear usuarios.
- Crear workspaces.
- Asociar todos los datos a `workspace_id`.
- Agregar roles: owner, admin, sales.
- Proteger rutas.
- Preparar recuperacion de contrasena.

Criterio de termino:

- Cada workspace ve solo sus datos.
- Hay roles basicos.
- El CRM deja de depender de datos hardcodeados.

### Fase 3: captura web

Objetivo: que el CRM reciba leads desde sitios web.

Tareas:

- Crear endpoint publico para eventos.
- Crear snippet JS instalable.
- Registrar visitas y UTMs.
- Crear formularios embebibles.
- Convertir submissions en contactos.
- Asociar fuente/campana/pagina al lead.
- Crear vista de "Fuentes de leads".

Criterio de termino:

- Un sitio externo puede enviar un lead al CRM.
- El CRM muestra de que URL, UTM y formulario vino.

### Fase 4: pipeline comercial completo

Objetivo: hacer que el CRM sea util en ventas reales.

Tareas:

- Pipeline configurable.
- Tareas y recordatorios.
- Timeline completo del contacto.
- Busqueda y filtros.
- Importacion CSV.
- Exportacion CSV.
- Vista Kanban de oportunidades.
- Vista tabla para contactos.

Criterio de termino:

- Un equipo comercial puede operar su dia dentro del CRM.

### Fase 5: integraciones clave

Objetivo: conectar canales donde ocurre la venta.

Prioridad:

1. WhatsApp.
2. Google Calendar.
3. Gmail o email transaccional.
4. Transbank / Mercado Pago / Khipu.
5. Google Analytics / Search Console / Google Ads.

Criterio de termino:

- Se puede agendar, contactar y registrar conversiones sin salir del CRM.

### Fase 6: automatizaciones e IA

Objetivo: aumentar valor percibido y reducir trabajo manual.

Tareas:

- Reglas simples tipo "si pasa X, hacer Y".
- Scoring basico de leads.
- Resumen de contacto.
- Siguiente mejor accion.
- Plantillas de respuestas.
- Alertas de oportunidades frias.

Criterio de termino:

- El CRM recomienda acciones y reduce seguimiento manual.

## Modelo de datos inicial

### Contact

Campos minimos:

- `id`
- `workspace_id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `company_id`
- `status`
- `source`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `created_at`
- `updated_at`

### Company

Campos minimos:

- `id`
- `workspace_id`
- `name`
- `website`
- `industry`
- `size`
- `created_at`
- `updated_at`

### Opportunity

Campos minimos:

- `id`
- `workspace_id`
- `contact_id`
- `company_id`
- `title`
- `stage_id`
- `value`
- `probability`
- `expected_close_date`
- `owner_id`
- `status`
- `created_at`
- `updated_at`

### Activity

Campos minimos:

- `id`
- `workspace_id`
- `contact_id`
- `opportunity_id`
- `type`
- `title`
- `description`
- `due_at`
- `completed_at`
- `created_by`
- `created_at`

## Pantallas principales

### Dashboard

- Leads del mes.
- Oportunidades abiertas.
- Ingresos cerrados.
- Tasa de conversion.
- Actividad reciente.
- Fuentes de leads.
- Oportunidades activas.

### Contactos

- Tabla con filtros.
- Ficha de contacto.
- Timeline.
- Notas.
- Oportunidades asociadas.
- Datos de origen web.

### Oportunidades

- Kanban por etapa.
- Tabla alternativa.
- Valor total por etapa.
- Probabilidad.
- Fecha estimada de cierre.
- Responsable.

### Actividades

- Lista de tareas.
- Recordatorios.
- Llamadas.
- Emails.
- Reuniones.
- Notas.

### Configuracion

- Workspace.
- Usuarios.
- Roles.
- Pipelines.
- Campos personalizados.
- Integraciones.
- Snippet web.
- Formularios.

## Principios de UX

- Interfaz densa pero clara.
- Sidebar estable.
- Busqueda global siempre disponible.
- Acciones principales visibles.
- Formularios cortos con disclosure progresivo.
- Tablas potentes, no decorativas.
- Estados vacios utiles.
- Evitar dashboards genericos sin accion.
- Optimizar para uso diario, no solo para demo.

## Riesgos actuales

- El CRM puede quedar como UI mock si no se prioriza persistencia.
- El backend legacy esta fuera del workspace activo.
- Los textos con problemas de encoding pueden afectar la marca.
- Integrar demasiadas features antes del CRUD real puede retrasar el MVP.
- Intentar competir por paridad con HubSpot/Odoo/Salesforce seria demasiado amplio.

## Prioridad inmediata

Orden sugerido para el siguiente bloque de trabajo:

1. Limpiar base tecnica del monorepo.
2. Definir si el backend sera NestJS separado o API dentro de Next para MVP.
3. Crear PostgreSQL + migraciones.
4. Pasar contactos y oportunidades de mock a DB.
5. Implementar autenticacion real.
6. Crear captura web basica.

## Decisiones pendientes

- Backend definitivo: NestJS en `apps/api` o API routes/server actions en `apps/crm`.
- ORM: Drizzle o Prisma.
- Auth: Auth.js, Lucia/custom, Clerk/Supabase, o backend propio.
- Hosting: Vercel para `apps/web` y `apps/crm`; Supabase Postgres para DB.
- Primer nicho comercial: servicios profesionales, salud, inmobiliario, educacion, comercio especializado u otro.
- Modelo de precios: por workspace, por usuario, por automatizaciones, o paquete incluido en mantenimiento web.

## Norte del MVP

El MVP no debe intentar ser "un CRM completo". Debe demostrar una cosa mejor que nadie para clientes Upzites:

"Cada lead que entra desde tu sitio queda ordenado, asignado, seguido y conectado a ventas reales."


---

# Anexo B - Actualizacion de web publica y servicios

> Consolidado desde contexto2.md el 2026-06-16. Documento unico maestro.
# contexto.md · UPZITES

## Objetivo del documento

Este archivo consolida el contexto actualizado de UPZITES para planificar la actualización de la web, especialmente la nueva estructura de servicios, los productos low ticket y el nuevo frente de marketing digital/contenido incorporado al ecosistema de la marca.

La tarea principal es usar este contexto para generar un plan de ejecución técnico y estratégico para actualizar la web de UPZITES.

---

# 1. Contexto general de UPZITES

UPZITES es un estudio digital que crea marcas, páginas web, sistemas digitales, automatizaciones e interfaces visuales para negocios, emprendedores y marcas que necesitan una presencia profesional.

La propuesta de valor evolucionó. UPZITES ya no debe comunicar únicamente branding, desarrollo web y automatización IA. Ahora debe presentarse como un ecosistema digital completo capaz de construir, activar y hacer crecer marcas desde varios frentes:

- Branding y dirección visual.
- Diseño y desarrollo web.
- Landing pages, e-commerce, catálogos web y sistemas digitales.
- Automatización e inteligencia artificial.
- Producción de contenido.
- Fotografía.
- Edición de video.
- Creativos para redes y campañas.
- Gestión de redes sociales.
- Meta Ads, Google Ads y performance digital.

Mensaje estratégico recomendado:

> Creamos marcas, webs y contenido que conectan, venden y crecen.

Mensaje ampliado:

> En UPZITES diseñamos ecosistemas digitales completos: identidad visual, desarrollo web, producción de contenido, redes sociales, publicidad y automatización.

---

# 2. Nuevo aliado / socio estratégico

UPZITES incorpora un nuevo aliado/socio experto en:

- Marketing digital.
- Edición de video.
- Fotografía.
- Producción audiovisual.
- Diseño de creativos.
- Contenido para redes sociales.
- Campañas publicitarias.
- Estrategia de crecimiento digital.

Este socio permite que UPZITES agregue una línea fuerte de servicios de contenido y performance sin perder la coherencia visual y estratégica de la marca.

Diferencial principal:

> UPZITES no hace contenido suelto. Hace contenido conectado al sistema de marca.

Esto significa que el branding, la web, el contenido, las redes y los ads deben funcionar bajo una misma dirección visual, narrativa y comercial.

---

# 3. Nueva arquitectura de servicios principales

La web debe reflejar 4 grandes pilares de servicios principales.

## 3.1 Branding y Dirección Visual

Servicio orientado a crear marcas profesionales y sistemas visuales coherentes.

Incluye potencialmente:

- Naming.
- Identidad visual.
- Logo.
- Paleta de colores.
- Tipografía.
- Sistema gráfico.
- Manual de marca.
- Dirección visual para redes, web y campañas.
- Plantillas visuales.

## 3.2 Diseño y Desarrollo Web

Servicio orientado a construir presencia digital y plataformas funcionales.

Incluye potencialmente:

- Landing pages.
- Páginas corporativas.
- Sitios web para servicios.
- E-commerce.
- Catálogos web.
- Sistemas personalizados.
- Automatizaciones conectadas a formularios, CRM o flujos internos.
- Integraciones con herramientas externas.

## 3.3 Marketing Digital y Contenido

Nueva línea fuerte gracias al aliado/socio.

Incluye potencialmente:

- Producción de contenido.
- Fotografía.
- Videos cortos.
- Reels.
- Edición de video.
- Creativos para redes sociales.
- Creativos para Meta Ads y Google Ads.
- Dirección de contenido.
- Calendario editorial.
- Community management.
- Gestión de redes.

## 3.4 Automatización e Inteligencia Artificial

Servicio orientado a optimizar procesos, captación y operación.

Incluye potencialmente:

- Flujos automáticos.
- Formularios inteligentes.
- Integraciones con CRM.
- Automatización de leads.
- Asistentes IA.
- Bots de atención.
- Sistemas internos.
- Reportes y dashboards.

---

# 4. Nueva estructura detallada de servicios de marketing digital

Esta estructura viene del documento estratégico interno: “UPZITES · Estructura de Nuevos Servicios · Producción de Contenido · Fotografía · Redes Sociales · Ads”.

## 4.1 Módulo 01 · Contenido con Dirección

Concepto:

> No es contenido bonito. Es contenido con sistema.

### Content Starter

Para marcas recién brandeadas o que lanzan desde cero.

Incluye:

- Estrategia de contenido.
- Pilares de contenido.
- Tono de comunicación.
- Formatos por plataforma.
- Calendario editorial mensual.
- Diseño de plantillas alineadas al manual de marca.
- Reels o videos cortos.
- Piezas estáticas.
- Copy para cada pieza.

### Content System

Para marcas que ya venden y necesitan consistencia y volumen.

Incluye:

- Estrategia de contenido.
- Análisis de métricas mensual.
- Calendario editorial.
- Reels/videos con edición profesional.
- Piezas estáticas.
- Stories.
- Community management básico.
- Reporte mensual de performance.

### Content Machine

Para marcas consolidadas que necesitan escalar su presencia.

Incluye:

- Producción de contenido de largo aliento.
- Clips para YouTube Shorts, podcasts o formatos derivados.
- Estrategia omnicanal.
- Gestión de UGC.
- Contenido potenciado con IA.
- Subtítulos automáticos.
- Repurposing.
- Community management completo.
- A/B testing de formatos.
- Informe estratégico mensual.

---

## 4.2 Módulo 02 · Producción Audiovisual

Concepto:

> Tu marca se ve antes de que la lean.

### Sesión Brand Content

Producción de contenido de marca en 1 día.

Incluye:

- Dirección creativa previa.
- Moodboard.
- Guion de sesión.
- Grabación.
- Reels editados en formato vertical.
- Video horizontal para web o YouTube.
- Clips crudos seleccionados.

### Sesión Fotografía Estratégica

Fotografía de marca, producto o personal branding.

Incluye:

- Moodboard.
- Dirección visual previa.
- Sesión en locación o estudio.
- Fotos editadas en alta resolución.
- Uso comercial.
- Versiones optimizadas para web, redes y print.

### Pack Contenido Trimestral

Activo visual para 3 meses de contenido.

Incluye:

- Sesiones de fotografía.
- Jornadas de grabación.
- Edición de reels.
- Banco de fotos editadas.
- Clips crudos seleccionados.
- Brief de uso del material.

---

## 4.3 Módulo 03 · Redes Sociales

Concepto:

> Tu presencia digital no puede verse como si la manejara alguien que no conoce la marca.

### Social Setup

Para marcas que necesitan arrancar con el pie derecho.

Incluye:

- Auditoría de cuentas actuales.
- Optimización de perfiles.
- Bio.
- Foto de perfil.
- Highlights.
- Links.
- Plantillas de stories y posts.
- Guía de tono y voz.
- Calendario modelo para el primer mes.

### Community Manager Estratégico

Gestión mensual con dirección de marca.

Incluye:

- Publicación de contenido.
- Gestión de comentarios y DMs.
- Interacción activa con la comunidad.
- Stories.
- Monitoreo de menciones.
- Reporte quincenal.

### Social Growth Sprint

Campaña de 30 a 60 días para crecimiento acelerado.

Incluye:

- Estrategia de crecimiento orgánico.
- Plan de colaboraciones.
- Hashtags.
- Contenido con potencial viral.
- Seguimiento semanal de métricas.
- Ajustes tácticos.

---

## 4.4 Módulo 04 · Paid Media / Ads con Intención

Concepto:

> Sin datos ni sistema, los ads son ruido pagado.

### Ads Setup & Lanzamiento

Para marcas que nunca han corrido anuncios o quieren resetear sus cuentas.

Incluye:

- Auditoría de cuentas publicitarias.
- Configuración de Business Manager.
- Meta Pixel.
- Conversions API.
- Segmentación estratégica.
- Creatividades iniciales.
- Lanzamiento de campaña.
- Monitoreo inicial.

### Meta Ads Management

Gestión mensual de campañas en Facebook e Instagram.

Incluye:

- Estrategia mensual.
- Creatividades mensuales.
- Segmentación.
- Optimización continua.
- A/B testing.
- Retargeting.
- Reporte semanal.

### Google Ads Management

Campañas de búsqueda, display y YouTube.

Incluye:

- Estrategia de keywords.
- Estructura de campañas.
- Google Analytics.
- Google Tag Manager.
- Campañas Search y Display.
- Recomendaciones de optimización de landing pages.
- Control de ROAS.
- Reporte mensual.

### Performance Full

Meta + Google + Creatividades + Optimización de funnel.

Incluye:

- Gestión de Meta Ads.
- Gestión de Google Ads.
- Producción de creatividades.
- Estrategia de funnel completo.
- CRO básico.
- Dashboard de métricas.
- Reunión estratégica quincenal.

---

# 5. Paquetes combinados

La web debe mostrar que UPZITES puede vender módulos sueltos o ecosistemas completos.

## Pack Presencia Activa

Para marcas pequeñas o en etapa temprana que quieren estar presentes con consistencia.

Combina:

- Contenido.
- Redes sociales.
- Ads básico.

## Pack Crecimiento Digital

Para marcas que ya tienen identidad y quieren escalar presencia y ventas.

Combina:

- Producción de contenido.
- Redes sociales.
- Meta Ads.
- Landing o funnel.

## Pack Ecosistema Completo

Para marcas consolidadas que necesitan un equipo digital integrado.

Combina:

- Branding.
- Web.
- Producción audiovisual.
- Redes sociales.
- Paid media.
- Automatización.
- Reportes.
- Optimización continua.

---

# 6. Método propio sugerido

## Método MARCA

Proceso interno recomendado para presentar los servicios:

- M · Mapear: estrategia, audiencia, objetivos y diagnóstico.
- A · Articular: narrativa, identidad, tono y sistema visual.
- R · Realizar: diseño, desarrollo, producción audiovisual y contenido.
- C · Conectar: publicación, comunidad, web, campañas y puntos de contacto.
- A · Amplificar: optimización, datos, ads, automatización y escalamiento.

Este método debe ayudar a explicar que UPZITES no trabaja piezas aisladas, sino sistemas completos.

---

# 7. Productos low ticket definitivos

Los productos low ticket deben mostrarse en la web principal como una línea de entrada accesible al ecosistema UPZITES.

No se deben llamar “low ticket” de cara al cliente. Nombre recomendado para la sección:

> Soluciones Express

Alternativas:

- Productos Rápidos.
- Activa tu Marca.
- Soluciones Digitales Express.

Recomendación principal:

> Soluciones Express

Texto sugerido para la sección:

> Soluciones digitales rápidas para marcas, emprendedores y eventos que necesitan verse profesionales sin esperar semanas. Diseñamos, producimos y entregamos piezas listas para usar, conectadas con tu identidad visual y tus objetivos comerciales.

## Regla clave

Cada producto low ticket debe tener:

- Una card o bloque dentro de la web principal de UPZITES.
- Un botón CTA visible.
- Una landing page propia.
- Dominio propio o subdominio propio configurable.
- Funcionamiento independiente.
- Conexión visual, comercial y estratégica con UPZITES.
- Tracking de conversiones.
- Formulario, WhatsApp o flujo de compra/cotización.
- Posibilidad de upsell hacia servicios mayores.

---

## 7.1 Invitaciones Digitales

Producto express para eventos.

Ideal para:

- Bodas.
- Cumpleaños.
- Baby showers.
- Bautizos.
- Graduaciones.
- Eventos corporativos.
- Lanzamientos.
- Fiestas privadas.

Posibles funcionalidades:

- Invitación web personalizada.
- Información del evento.
- Cuenta regresiva.
- Confirmación de asistencia.
- Botones a Google Maps y Waze.
- Música.
- Galería.
- Dress code.
- Sección de regalos.
- Transferencia o MercadoPago.
- Diseño adaptado al evento.

Funcionalidad avanzada para plan Pro:

- QR único por invitado.
- Validación en entrada.
- QR escaneable una sola vez.
- Sistema tipo entrada digital.

CTA desde la web principal:

- Ver invitaciones digitales.
- Crear mi invitación.
- Cotizar invitación web.

Landing independiente:

- Debe tener dominio propio o subdominio propio.
- Debe funcionar como producto autónomo.
- Debe mantener conexión visual con UPZITES.

Upsells naturales:

- Álbum QR en vivo.
- Fotografía de evento.
- Video resumen.
- Reel post-evento.
- Landing de recuerdo.

---

## 7.1.1 Álbum QR en Vivo

Servicio adicional para Invitaciones Digitales y eventos.

No debe ser tratado como producto principal de la misma jerarquía que Invitaciones Digitales, salvo que comercialmente se quiera ofrecer también como add-on independiente.

Cómo funciona:

- Los invitados escanean un QR durante el evento.
- Suben una foto.
- Escriben una dedicatoria o mensaje.
- El contenido se proyecta en vivo en una pantalla.
- Al final queda una galería digital del evento.

Ideal para:

- Bodas.
- Cumpleaños.
- Eventos de empresa.
- Baby showers.
- Graduaciones.
- Lanzamientos.
- Fiestas privadas.

Mensaje comercial:

> Convierte los recuerdos de tus invitados en una experiencia en vivo.

CTA posible:

- Agregar Álbum QR.
- Ver cómo funciona.
- Cotizar experiencia QR.

---

## 7.2 Reel Express 24H

Producto express de contenido.

Promesa:

> Guion, grabación, edición y reel listo en 24 horas.

Ideal para:

- Emprendedores.
- Marcas personales.
- Negocios locales.
- Restaurantes.
- Inmobiliarias.
- Tiendas.
- Profesionales.
- Servicios.

Incluye:

- Idea o concepto del reel.
- Guion breve.
- Dirección de grabación.
- Grabación.
- Edición vertical.
- Subtítulos.
- Música o ritmo visual.
- Entrega en 24 horas.

CTA desde la web principal:

- Crear mi reel 24H.
- Agendar sesión express.
- Ver Reel Express.

Landing independiente:

- Debe enfocarse en velocidad, claridad y resultado listo para publicar.
- Debe tener flujo de reserva o contacto rápido.

Upsells naturales:

- Pack mensual de contenido.
- Community manager.
- Meta Ads.
- Producción audiovisual mensual.
- Branding personal.

---

## 7.3 Landing Express

Producto express para crear una landing rápida y profesional.

Ideal para:

- Lanzar un servicio.
- Captar leads.
- Validar una idea.
- Promocionar una campaña.
- Vender un producto simple.
- Presentar una marca personal.
- Anunciar un evento.

Incluye potencialmente:

- Diseño de landing one page.
- Copy base.
- Formulario de contacto.
- Botón WhatsApp.
- Secciones esenciales.
- Adaptación responsive.
- Configuración básica SEO.
- Publicación en dominio o subdominio.

CTA desde la web principal:

- Crear mi landing express.
- Lanzar mi página.
- Ver Landing Express.

Landing independiente:

- Debe comunicar rapidez, foco y conversión.

Upsells naturales:

- Web completa.
- Branding.
- Campañas de ads.
- Automatización de leads.
- CRM simple.

---

## 7.4 Catálogo Web Express

Producto express tipo e-commerce muy básica.

Definición:

> Un catálogo web simple para mostrar productos, recibir consultas y ordenar la oferta sin desarrollar una tienda completa.

No debe venderse como e-commerce robusto. Es una solución rápida para negocios que necesitan mostrar productos y recibir pedidos o cotizaciones.

Ideal para:

- Tiendas pequeñas.
- Emprendedores.
- Catálogos de productos.
- Negocios con venta por WhatsApp.
- Mayoristas pequeños.
- Marcas que aún no necesitan checkout completo.

Funcionalidades posibles:

- Listado de productos.
- Categorías.
- Filtros simples.
- Ficha de producto básica.
- Botón para pedir por WhatsApp.
- Formulario de cotización.
- Panel simple o carga manual de productos.
- Diseño responsive.

CTA desde la web principal:

- Crear mi catálogo web.
- Ver Catálogo Express.
- Digitalizar mis productos.

Landing independiente:

- Debe posicionarse como alternativa rápida y económica frente a una tienda online completa.

Upsells naturales:

- E-commerce completo.
- Integración con pagos.
- Inventario.
- Automatizaciones.
- SEO para productos.
- Ads para catálogo.

---

## 7.5 Carta QR Restaurante

Producto express para restaurantes, cafeterías, food trucks y negocios gastronómicos.

Definición:

> Una carta digital con QR para que tus clientes vean el menú desde el celular, con diseño profesional y fácil actualización.

Ideal para:

- Restaurantes.
- Cafeterías.
- Bares.
- Food trucks.
- Dark kitchens.
- Pastelerías.
- Negocios de comida rápida.

Funcionalidades posibles:

- Menú digital responsive.
- QR para mesas.
- Categorías de productos.
- Fotos de platos.
- Precios.
- Descripciones.
- Botón WhatsApp o pedir.
- Diseño alineado a la marca.
- Actualización simple.

CTA desde la web principal:

- Crear mi carta QR.
- Ver Carta QR Restaurante.
- Digitalizar mi menú.

Landing independiente:

- Debe hablar directamente al rubro gastronómico.
- Debe mostrar beneficios: más orden, mejor experiencia, fácil actualización, mejor presentación.

Upsells naturales:

- Fotografía gastronómica.
- Reels para restaurantes.
- Gestión de redes.
- Meta Ads local.
- Landing para reservas.
- Branding gastronómico.

---

# 8. Cómo deben integrarse los productos express en la web principal

La home y la página de servicios deben incluir una sección llamada “Soluciones Express”.

Cada card debe tener:

- Nombre del producto.
- Descripción corta.
- Beneficio principal.
- Ideal para quién.
- CTA hacia landing independiente.

Ejemplo de estructura de card:

```txt
[Nombre del producto]
Descripción breve en una frase.
Ideal para: segmento principal.
Botón: Ver solución
```

Cards sugeridas:

1. Invitaciones Digitales.
2. Reel Express 24H.
3. Landing Express.
4. Catálogo Web Express.
5. Carta QR Restaurante.

El Álbum QR en Vivo debe aparecer como add-on destacado dentro de Invitaciones Digitales y también puede tener una mini-card secundaria si se quiere destacar en eventos.

---

# 9. Arquitectura recomendada para la navegación

Menú principal sugerido:

- Inicio.
- Servicios.
- Soluciones Express.
- Planes.
- Portafolio.
- Nosotros.
- Contacto.

Dentro de Servicios:

- Branding.
- Desarrollo Web.
- Marketing Digital y Contenido.
- Ads y Performance.
- Automatización IA.

Dentro de Soluciones Express:

- Invitaciones Digitales.
- Reel Express 24H.
- Landing Express.
- Catálogo Web Express.
- Carta QR Restaurante.

---

# 10. Arquitectura recomendada de rutas

La web principal puede tener rutas internas informativas, pero cada producto express debe apuntar a una landing independiente con dominio/subdominio propio.

Rutas internas sugeridas dentro de UPZITES:

```txt
/servicios
/servicios/branding
/servicios/desarrollo-web
/servicios/marketing-digital
/servicios/produccion-contenido
/servicios/ads-performance
/servicios/automatizacion-ia
/soluciones-express
```

Landing pages independientes sugeridas:

```txt
[invitaciones-digitales-dominio-propio]
[reel-express-dominio-propio]
[landing-express-dominio-propio]
[catalogo-web-express-dominio-propio]
[carta-qr-restaurante-dominio-propio]
```

También pueden funcionar como subdominios:

```txt
invitaciones.upzites.com
reel24.upzites.com
landingexpress.upzites.com
catalogo.upzites.com
cartaqr.upzites.com
```

Nota: los dominios finales deben ser definidos por el equipo. No hardcodear dominios inventados sin validación.

---

# 11. Requerimientos para la actualización de la web

La actualización debe lograr lo siguiente:

1. Incorporar la nueva línea de marketing digital, contenido, fotografía, video, creativos y ads.
2. Reorganizar los servicios actuales para que UPZITES se perciba como ecosistema completo.
3. Integrar los productos low ticket bajo la sección “Soluciones Express”.
4. Crear botones CTA desde cada producto express hacia su landing independiente.
5. Preparar estructura escalable para que cada landing pueda vivir en su propio dominio o subdominio.
6. Mantener coherencia visual con la identidad de UPZITES.
7. Mejorar copy, jerarquía, navegación y conversión.
8. Preparar tracking para medir clicks, leads y conversiones.
9. Evitar que la web se sienta saturada o confusa.
10. Mostrar claramente la diferencia entre servicios premium y soluciones express.

---

# 12. Plan de ejecución esperado

El plan que se genere debe incluir fases claras:

## Fase 1 · Auditoría de la web actual

- Revisar estructura actual.
- Detectar rutas existentes.
- Detectar componentes reutilizables.
- Revisar contenido actual de servicios.
- Identificar qué se conserva, qué se reescribe y qué se elimina.

## Fase 2 · Arquitectura de información

- Nueva navegación.
- Nueva estructura de servicios.
- Nueva sección Soluciones Express.
- Jerarquía entre servicios premium y productos express.
- Rutas internas y CTAs externas.

## Fase 3 · Copywriting y contenido

- Hero actualizado.
- Textos para servicios principales.
- Textos para marketing digital y contenido.
- Textos para productos express.
- CTAs.
- Microcopy.

## Fase 4 · Diseño UI

- Cards de servicios.
- Cards de soluciones express.
- Sección de paquetes combinados.
- Sección Método MARCA.
- CTA final.
- Adaptación responsive.

## Fase 5 · Desarrollo

- Implementar rutas.
- Componentizar secciones.
- Crear estructura de datos para servicios y productos express.
- Conectar CTAs con URLs configurables.
- Evitar hardcodear dominios definitivos.

## Fase 6 · Tracking y medición

- Eventos de click en CTAs.
- Eventos de formulario.
- PageView en cambios de ruta SPA.
- Meta Pixel si corresponde.
- Google Analytics / Tag Manager si corresponde.

## Fase 7 · SEO

- Titles.
- Meta descriptions.
- Open Graph.
- Schema básico si aplica.
- Keywords por servicio.
- SEO para servicios y productos express.

## Fase 8 · QA y despliegue

- Revisión responsive.
- Revisión de links.
- Prueba de formularios.
- Prueba de tracking.
- Validación de performance.
- Deploy.

---

# 13. Prompt recomendado para generar el plan de ejecución

Usar el siguiente prompt en Codex, Claude o ChatGPT con acceso al proyecto:

```txt
Actúa como arquitecto frontend, estratega UX/UI y consultor de conversión para una web de servicios digitales.

Tengo una web llamada UPZITES. Necesito generar un plan de ejecución para actualizar específicamente la estructura de servicios de la web, integrando una nueva línea de marketing digital, producción de contenido, fotografía, edición de video, creativos, redes sociales y paid media, además de una nueva línea de productos express de bajo ticket.

Contexto de marca:
UPZITES es un estudio digital que crea marcas, webs, contenido y sistemas digitales que conectan, venden y crecen. La marca ya trabaja branding, desarrollo web y automatización IA, pero ahora incorpora un nuevo aliado/socio experto en marketing digital, fotografía, edición de video, producción audiovisual, diseño de creativos, redes sociales y ads.

Diferencial:
UPZITES no hace contenido suelto. Hace contenido conectado al sistema de marca. Branding, web, contenido, redes y ads deben trabajar bajo una misma dirección visual, narrativa y comercial.

Nueva estructura de servicios principales:
1. Branding y Dirección Visual.
2. Diseño y Desarrollo Web.
3. Marketing Digital y Contenido.
4. Automatización e Inteligencia Artificial.
5. Ads y Performance.

Nueva línea de marketing digital/contenido:
- Contenido con Dirección: Content Starter, Content System, Content Machine.
- Producción Audiovisual: Sesión Brand Content, Sesión Fotografía Estratégica, Pack Contenido Trimestral.
- Redes Sociales: Social Setup, Community Manager Estratégico, Social Growth Sprint.
- Paid Media: Ads Setup & Lanzamiento, Meta Ads Management, Google Ads Management, Performance Full.

Paquetes combinados:
- Presencia Activa.
- Crecimiento Digital.
- Ecosistema Completo.

Método propio sugerido:
Método MARCA:
- Mapear.
- Articular.
- Realizar.
- Conectar.
- Amplificar.

Productos express / bajo ticket:
Estos productos NO deben llamarse “low ticket” de cara al cliente. Deben agruparse bajo la sección “Soluciones Express”.

Productos definitivos:
1. Invitaciones Digitales.
   - Debe tener como servicio adicional el Álbum QR en Vivo.
   - La invitación puede incluir confirmación de asistencia, mapas, música, cuenta regresiva, regalos y, en planes pro, QR único por invitado escaneable una sola vez.
2. Reel Express 24H.
   - Guion, grabación, edición y reel listo en 24 horas.
3. Landing Express.
   - Landing one page rápida para captar leads, vender un servicio o validar una idea.
4. Catálogo Web Express.
   - Similar a una e-commerce muy básica: catálogo de productos, categorías, ficha simple y contacto por WhatsApp o formulario.
5. Carta QR Restaurante.
   - Carta digital con QR para restaurantes, cafeterías, bares, food trucks y negocios gastronómicos.

Regla clave para productos express:
Cada producto express debe tener una card/sección dentro de la web principal de UPZITES y un botón CTA que lleve a su propia landing page. Cada landing debe tener dominio propio o subdominio propio, funcionar aparte como producto autónomo, pero mantenerse como parte del ecosistema visual y comercial de UPZITES.

Necesito que generes un plan de ejecución completo para actualizar la web. No implementes todavía. Primero entrega el plan.

El plan debe incluir:
1. Diagnóstico inicial de qué revisar en la web actual.
2. Nueva arquitectura de información.
3. Propuesta de navegación principal.
4. Nueva estructura de páginas/rutas.
5. Secciones que debe tener la home.
6. Secciones que debe tener la página de servicios.
7. Sección “Soluciones Express” con los 5 productos y el add-on Álbum QR en Vivo.
8. Copy base recomendado para hero, servicios y productos express.
9. CTAs recomendados por cada servicio/producto.
10. Cómo separar visualmente servicios premium vs soluciones express.
11. Componentes UI que se deben crear o modificar.
12. Estructura de datos recomendada para servicios/productos.
13. Requerimientos de SEO.
14. Requerimientos de tracking y conversiones.
15. Requerimientos responsive.
16. Checklist QA antes de publicar.
17. Orden de implementación por fases.
18. Criterios de aceptación para considerar terminada la actualización.

Condiciones importantes:
- No hardcodear dominios finales de las landings; deben quedar configurables.
- Mantener coherencia visual con UPZITES.
- Evitar saturar la home.
- Priorizar claridad comercial y conversión.
- Cada solución express debe tener un camino natural de upsell hacia servicios más grandes.
- El resultado debe servir para que luego un desarrollador pueda implementar los cambios en Next.js o el stack actual de la web.
```

---

# 14. Criterio estratégico final

La actualización debe comunicar esta idea:

> UPZITES crea el sistema completo: marca, web, contenido, publicidad y automatización.

Y las Soluciones Express deben funcionar como la entrada accesible:

> ¿No necesitas un proyecto completo todavía? Empieza con una solución express.


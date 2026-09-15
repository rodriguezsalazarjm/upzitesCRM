# Cierre tecnico de la beta — CRM Upzites

Actualizado: 15 de septiembre de 2026

Este documento cierra el trabajo de estabilizacion y dice, sin adornos, en que
estado esta cada cosa. El detalle tecnico de cada bloque vive en
[CRM_BETA_STABILIZATION.md](CRM_BETA_STABILIZATION.md); la operacion diaria en
[OPERACION.md](OPERACION.md); los incidentes en [RUNBOOKS.md](RUNBOOKS.md).

**Validacion local completada:** 26 migraciones aplicadas en crm_pruebas,
780/780 comprobaciones de integracion y 71/71 unitarias aprobadas. Cero fallos
pendientes en las suites ejecutadas. Proveedores simulados; comunicaciones
externas bloqueadas. No se uso produccion, no se migro Supabase y no se publico.

Los datos de produccion/proveedores que siguen proceden del registro anterior;
no se volvieron a comprobar durante esta validacion.

---

## 1. Estado por funcionalidad

| Tarea | Estado | Evidencia | Pendiente del propietario |
|---|---|---|---|
| Despliegue automatico desde Git | **Funcionando** | Deployment Ready con alias `crm.upzites.com`, health HTTP 200 | Nada |
| Entorno aislado de pruebas | **Validado localmente** | 26 migraciones, marcador correcto, HTTP bloqueado | Nada para ejecutar las suites |
| Toma de control humana | **Carreras locales verificadas** | Cola, takeover, SENDING/fallo y aislamiento | Recorrido visual con dos operadores |
| Configuracion y cotizador | **Persistencia y carreras locales verificadas** | Fase7 79/79 + casos beta de versionado, publicacion y aprobacion | Recorrer interfaz con datos locales |
| Inbox movil y PWA | Web completa, **sin telefono real** | Manifest, service worker y pantalla offline verificados en navegador | Instalar en el Samsung y probar teclado, rotacion y reconexion |
| Notificaciones push | **Persistencia/permisos locales verificados**; entrega real pendiente | Alta concurrente aislada, preferencias, roles, dedupe y expiracion | VAPID y telefono real en etapa autorizada |
| Archivos de WhatsApp | **Descarga simulada y permisos locales verificados** | Estados, disco, 401/404/409, dedupe de Meta | Bucket y recepcion real de foto/audio/PDF en etapa autorizada |
| Puesta en marcha | **Reglas persistidas verificadas**; pantalla pendiente | Fase9 78/78 + modalidades y plan sin cotizador | Recorrerla como cliente nuevo en local |
| Exportacion y borrado por titular | **No existe** | — | Decidir alcance con el abogado (§6) |
| Backups y restauracion | **Nunca se probo restaurar** | — | Hacer una restauracion de prueba (§5) |

### Que significa cada nivel de evidencia

El sistema distingue —y este documento tambien— tres cosas que suelen
confundirse en una sola palabra:

- **Unitaria o simulada:** la regla hace lo que dice, con datos inventados.
  Cubre la logica, no la integracion.
- **Base aislada:** los flujos anteriores se probaron contra PostgreSQL 18 local,
  con proveedores simulados y handlers autenticados. No equivale a un navegador real.
- **Proveedor real:** contra Meta, OpenAI, Mercado Pago, Resend o Shopify. Solo
  dos cosas llegaron aqui, y fueron manuales: recibir un mensaje de WhatsApp y
  responderlo desde la bandeja.

---

## 2. Commits

Todos los commits de esta validacion son locales, sin push:

| Commit local | Correccion |
|---|---|
| `f17d548` | Lanzadores Windows: Node directo, sin invocar pnpm.cmd con spawnSync |
| `662a22a` | Marcador compartido, verificacion anterior a Prisma, claves ficticias y bloqueo HTTP/HTTPS/fetch |
| `9f5a56e` | Fechas UTC en cola y bloqueo del agente, independientes de la zona de PostgreSQL |
| `cf37bab` | Cierre de SENDING tras fallo de red y toma humana, sin reintentar la generacion anterior |
| `4d4846d` | Alta push concurrente no reemplaza claves de otro usuario/workspace |
| `018dc3b` | Versiones y publicacion de reglas serializadas por workspace |
| `ff12f84` | Servicios sin capacidad QUOTES no completan onboarding aunque conserven reglas publicadas |
| `d7594d0` | Suite beta con carreras y permisos; fixtures coherentes y reejecucion selectiva |

El commit documental de cierre acompana estos cambios. El historial anterior
permanece en Git; el ultimo despliegue registrado era d100ae7. No se consulto
ni cambio ese despliegue durante esta sesion.

---

## 3. Migraciones pendientes y orden de despliegue

Hay **26 migraciones**, todas aplicadas en **crm_pruebas local**. No se agregaron
migraciones en esta sesion. La verificacion final informa cero pendientes.
El inventario completo esta en CRM_BETA_STABILIZATION.md.

El registro anterior indica **22 aplicadas** en produccion, sin comprobarlo ni
modificarlo ahora. Las
cuatro que faltan se aplican en este orden:

1. `20260914160000_human_takeover_outbox` — agrega `SENDING` y `CANCELLED` a los
   estados de mensaje y de outbox. Sin backfill.
2. `20260914170000_push_notifications` — tabla `push_subscriptions` y el trabajo
   `SEND_PUSH`. No toca datos existentes.
3. `20260914190000_whatsapp_media` — tabla `media_assets`, estados de archivo y
   el trabajo de descarga. No toca datos existentes.
4. `20260914200000_media_huerfanos` — cambia una clave foranea para que un
   archivo no pueda quedar en el bucket sin registro que lo apunte.

**Las migraciones no se aplican solas.** No hay `prisma migrate deploy` en el
build ni en `vercel.json`: el `prebuild` es solo `prisma generate`. El orden
correcto es **migrar primero, desplegar despues**. Si se despliega codigo que
espera una tabla que no existe, la aplicacion arranca igual y falla en la
primera consulta que la toque.

Las migraciones viajan por `DIRECT_URL` (pooler de sesion, puerto 5432), no por
`DATABASE_URL` (pooler de transaccion, 6543).

---

## 4. Variables de entorno nuevas

Ninguna trae su valor aqui. Las marcadas como secretas no deben aparecer en
documentacion, capturas ni mensajes.

| Variable | Para que | Secreta | Si falta |
|---|---|---|---|
| `VAPID_PUBLIC_KEY` | Identifica al emisor de las notificaciones push | No | No se puede suscribir ningun navegador |
| `VAPID_PRIVATE_KEY` | Firma cada notificacion push | **Si** | Igual que arriba |
| `VAPID_SUBJECT` | Contacto que el proveedor push exige (correo o URL) | No | Algunos navegadores rechazan el envio |
| `SUPABASE_URL` | Project URL del proyecto Supabase. No es la cadena de conexion | No | Los archivos recibidos quedan bloqueados |
| `SUPABASE_SERVICE_ROLE_KEY` | Escribir y leer el bucket privado. Salta las politicas de acceso | **Si** | Igual que arriba |
| `MEDIA_STORAGE_BUCKET` | Nombre del bucket privado. Por defecto `crm-media` | No | Se usa el nombre por defecto |
| `MEDIA_STORAGE_DRIVER` | Fuerza `supabase` o `filesystem`. Vacio: se deduce | No | Se deduce por las claves de Supabase |
| `MEDIA_RETENTION_DAYS` | Dias que se conserva un archivo recibido. Por defecto 180 | No | Se usan 180 |
| `SUPABASE_CA_CERT` | Certificado raiz para validar TLS contra Supabase | No | Ver el gotcha de TLS en OPERACION.md |
| `TEST_DATABASE_URL` | Base aislada de pruebas. **Nunca la de produccion** | **Si** | Los smoke tests se niegan a correr |
| `TEST_DIRECT_URL` | Conexion directa de esa misma base, para migrarla | **Si** | Solo impide `test:db:deploy` |

El inventario completo, incluidas las anteriores, esta en
[OPERACION.md](OPERACION.md#variables-de-entorno) y en `apps/crm/.env.example`.

### Caducidad y renovacion de credenciales

Esto no esta automatizado y no avisa solo. Conviene anotarlo en un calendario.

| Credencial | Caduca | Que pasa al vencer |
|---|---|---|
| Token de WhatsApp (usuario de sistema) | No caduca si es de usuario de sistema; **60 dias** si es un token de usuario normal | Deja de entrar y salir todo WhatsApp. El health lo muestra |
| Token de acceso de Meta para administrar la WABA | Igual que arriba | No se pueden conectar numeros nuevos |
| OAuth de Shopify | Mientras la app siga instalada | Se detiene la sincronizacion de catalogo |
| Access token de Mercado Pago | No caduca; se revoca a mano | El checkout deja de crear pagos |
| `RESEND_API_KEY` | No caduca | No sale ningun correo |
| `OPENAI_API_KEY` | No caduca | El agente no responde |
| Claves VAPID | No caducan | — |
| `SUPABASE_SERVICE_ROLE_KEY` | No caduca; se rota desde el panel | Los archivos dejan de guardarse y de servirse |
| `INTEGRATION_ENCRYPTION_KEY` | No caduca | **Rotarla sin migrar los datos deja ilegibles todos los tokens guardados.** No hay rutina de rotacion: hoy implica reconectar cada integracion a mano |

---

## 5. Recuperacion

### Si hay que volver atras un despliegue

Vercel guarda los despliegues anteriores: se promueve el anterior desde el
panel. **Pero una migracion ya aplicada no se revierte sola.** Si el despliegue
que falla venia con migracion, volver el codigo atras deja la base adelantada,
lo que normalmente es inofensivo —una columna de mas no molesta— salvo que la
migracion haya borrado o renombrado algo. Ninguna de las cuatro pendientes lo
hace: las tres primeras solo agregan, y la cuarta cambia una regla de borrado.

### Si hay que restaurar la base

Supabase mantiene backups automaticos del proyecto. **Nunca se ha probado
restaurar uno**, y un backup que no se probo no es un backup: es una suposicion.
Es lo primero que conviene hacer en un proyecto de prueba, antes de tener
clientes que perder.

Al restaurar hay que tener presente que **los archivos del bucket no viajan con
la base**: se restauran por separado. Una base restaurada a ayer con un bucket
de hoy deja filas que apuntan a archivos correctos, y archivos sin fila que los
reclame; el mantenimiento diario los recoge como huerfanos.

### Si hay que parar todo

Esta en [RUNBOOKS.md](RUNBOOKS.md#1-cortes-de-emergencia): interruptores por
funcion, suspension del workspace y corte del cron, en ese orden de menor a
mayor dano.

---

## 6. Limitaciones conocidas

Estas son decisiones tomadas y sus consecuencias, no defectos por corregir.

- **Un mensaje ya aceptado por Meta no se puede cancelar.** Si al tomar la
  conversacion hay una respuesta automatica en vuelo, el sistema la conserva y
  avisa al operador en lugar de fingir que la detuvo.
- **Los archivos se descargan enteros en memoria** antes de guardarse. Por eso
  el tope de documento es 25 MB y no los 100 MB que admite WhatsApp.
- **El CRM solo recibe archivos, no los envia.** Enviar un adjunto desde la
  bandeja no esta implementado.
- **No hay exportacion ni borrado ejercidos por el titular.** El operador puede
  borrar un contacto —y eso ahora tambien borra sus archivos— y exportar su
  lista en CSV, pero no existe "dame todo lo que sabes de esta persona" ni un
  canal para que la persona lo pida. Alcance y plazos los define el abogado.
- **Los registros de auditoria y los pedidos sobreviven al borrado del
  contacto.** Es deliberado: trazabilidad de decisiones y obligaciones
  contables. Conviene que la politica de privacidad lo diga.
- **El consumo del plan se mide, pero no hay cobro automatico.** Los excedentes
  quedan registrados; cobrarlos es manual.
- **La evidencia local no sustituye la entrega real ni la experiencia en telefono.**
  Los proveedores permanecieron bloqueados.

---

## 7. Pruebas ejecutadas y pendientes

| Suite | Aprobadas | Fallidas finales |
|---|---:|---:|
| smoke-fase1 | 41/41 | 0 |
| smoke-fase2 | 46/46 | 0 |
| smoke-fase3 | 46/46 | 0 |
| smoke-fase4 | 74/74 | 0 |
| smoke-fase5 | 70/70 | 0 |
| smoke-fase6 | 74/74 | 0 |
| smoke-fase7 | 79/79 | 0 |
| smoke-fase8 | 142/142 | 0 |
| smoke-fase9 | 78/78 | 0 |
| smoke-critico | 116/116 | 0 |
| smoke-beta | 14/14 | 0 |
| **Total integracion** | **780/780** | **0** |

- Unitarias: **71/71**; regresion posterior de las 52 pertinentes: **52/52**.
- TypeScript y ESLint del codigo cambiado: correctos; diff sin errores.
- `test:db:deploy`: 26 aplicadas y segunda verificacion sin pendientes.
- `test:smoke` no se ejecuto por separado: ya esta en `test:smoke:all`.
- Las suites se reanudaron selectivamente tras corregir cada fallo; el total
  representa el ultimo resultado de cada una, no una sola pasada ininterrumpida.

**Fallos resueltos:** lanzador Windows EINVAL; consulta equivocada del marcador;
imports antes de verificar la base; UTC en cola/bloqueos; fixtures sin consentimiento,
token ausente o producto vendible; concurrencia de agente sin solapamiento forzado;
SENDING atascado tras takeover/fallo; alta push que sobrescribia otro propietario;
colision de versiones de reglas; varias publicaciones vigentes simultaneas;
onboarding que ignoraba la perdida de QUOTES con reglas publicadas.
El detalle y los resultados iniciales fallidos estan en CRM_BETA_STABILIZATION.md.

El marcador **ya estaba correcto**. La indicacion inicial de ausencia fue un
fallo de consulta corregido; no se reinstalo ni se debilito la comprobacion.

**Deduplicacion:** se repitio concurrentemente el mismo evento de Meta y se
comprobo un solo mensaje/medio/trabajo. El mismo archivo enviado en otro mensaje
produjo otro registro valido.

**Pendientes:** prueba visual autenticada, Samsung/PWA/permisos del navegador,
entrega real de push, Meta/Storage, pagos/IA y restauracion de backup. No se
corrieron carga ni build en esta sesion. No hay un bloqueo de base local pendiente.

---

## 8. Riesgos que todavia impiden lanzar

Ordenados por lo que cuesta si salen mal.

1. **Ninguna integracion de pago se probo contra el proveedor real.** Un error
   aqui no se descubre en una prueba: se descubre con el dinero de un cliente.
2. **El agente nunca respondio con el modelo real.** La clave de OpenAI existe
   pero no tiene saldo. Todo lo probado uso un proveedor guionizado y
   determinista, que sirve para verificar reglas y no dice **nada** sobre como
   redacta el modelo.
3. **Nunca se restauro un backup.**
4. **Se opera con el numero de prueba de Meta.** Migrar al numero definitivo es
   irreversible en la practica y no esta ensayado.
5. **La normativa de datos personales no esta cubierta**: falta el flujo por
   titular, la redaccion legal, el responsable de datos y los acuerdos de
   encargado con cada proveedor.
6. **Cuatro migraciones sin aplicar** que hay que ejecutar a mano, en orden,
   antes de desplegar lo que depende de ellas.

---

## 9. Costos y decisiones que requieren al propietario

| Decision | Por que no la puede tomar un agente |
|---|---|
| Cargar saldo en OpenAI | Es un gasto, y el monto define cuanto puede conversar el agente |
| Activar Mercado Pago en produccion | Requiere credenciales a nombre del negocio |
| Contratar el plan de Resend | Gasto recurrente segun volumen de correo |
| Bucket de Supabase Storage | Entra en el plan actual, pero el trafico de servir archivos se paga: cada foto que un operador abre se descarga desde la funcion |
| Numero definitivo de WhatsApp | Decision comercial e irreversible |
| Precios de los planes de la beta | Decision comercial |

---

## 10. Proxima accion concreta

**Preparar un recorrido visual local con dos usuarios de workspaces distintos.**
Usar crm_pruebas con datos de demostracion y proveedores bloqueados para revisar
Inbox, toma humana, cotizaciones y onboarding; despues verificar PWA y permisos
en el Samsung S24 Ultra. Los handlers ya se probaron con sesiones firmadas,
pero el navegador y el telefono siguen pendientes.

No publicar ni migrar produccion como parte de ese recorrido. La entrega real
de push y archivos requiere otra etapa autorizada con VAPID, almacenamiento y
numero de prueba de Meta. Las restricciones de esta sesion siguen vigentes.

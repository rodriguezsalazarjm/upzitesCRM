# Cierre tecnico de la beta — CRM Upzites

Actualizado: 14 de septiembre de 2026

Este documento cierra el trabajo de estabilizacion y dice, sin adornos, en que
estado esta cada cosa. El detalle tecnico de cada bloque vive en
[CRM_BETA_STABILIZATION.md](CRM_BETA_STABILIZATION.md); la operacion diaria en
[OPERACION.md](OPERACION.md); los incidentes en [RUNBOOKS.md](RUNBOOKS.md).

Una advertencia que vale para todo lo que sigue: **que el build pase y las
pruebas esten en verde no significa que el sistema este probado**. Casi nada de
lo que depende de un proveedor externo se ha ejercitado contra el proveedor
real, y eso esta dicho tarea por tarea.

---

## 1. Estado por funcionalidad

| Tarea | Estado | Evidencia | Pendiente del propietario |
|---|---|---|---|
| Despliegue automatico desde Git | **Funcionando** | Deployment Ready con alias `crm.upzites.com`, health HTTP 200 | Nada |
| Entorno aislado de pruebas | Codigo listo, **sin ejecutar** | Cerco de seguridad con 6/6 unitarias | Contrasena de PostgreSQL local (ver §7) |
| Toma de control humana | Implementado, **sin probar en carrera** | 20/20 unitarias de WhatsApp; migracion pendiente | Aplicar migracion; probar dos operadores a la vez |
| Configuracion y cotizador | Invariantes reforzadas, **persistencia sin probar** | 4/4 unitarias de precios | Probar crear, versionar, publicar y aprobar con datos reales |
| Inbox movil y PWA | Web completa, **sin telefono real** | Manifest, service worker y pantalla offline verificados en navegador | Instalar en el Samsung y probar teclado, rotacion y reconexion |
| Notificaciones push | Codigo completo, **nunca se entrego una** | 3/3 unitarias de politica y contenido | Generar claves VAPID; probar en pantalla bloqueada |
| Archivos de WhatsApp | Codigo completo, **nunca se descargo uno** | 12/12 de politica, 8 de destinos permitidos, 7 de almacenamiento; 401 verificado en vivo | Crear bucket privado; recibir foto, audio y PDF reales |
| Puesta en marcha | Codigo completo, **pantalla no vista con datos** | 19/19 unitarias, matriz completa de modalidades | Recorrerla como cliente nuevo |
| Exportacion y borrado por titular | **No existe** | — | Decidir alcance con el abogado (§6) |
| Backups y restauracion | **Nunca se probo restaurar** | — | Hacer una restauracion de prueba (§5) |

### Que significa cada nivel de evidencia

El sistema distingue —y este documento tambien— tres cosas que suelen
confundirse en una sola palabra:

- **Unitaria o simulada:** la regla hace lo que dice, con datos inventados.
  Cubre la logica, no la integracion.
- **Base aislada:** el flujo completo contra una base real. **Ninguna tarea
  llego a este nivel**, porque la base aislada no existe todavia.
- **Proveedor real:** contra Meta, OpenAI, Mercado Pago, Resend o Shopify. Solo
  dos cosas llegaron aqui, y fueron manuales: recibir un mensaje de WhatsApp y
  responderlo desde la bandeja.

---

## 2. Commits

Nueve commits desde `eadd2b5`. Los seis primeros son de la sesion de Codex; los
tres ultimos, de la continuacion.

| Commit | Que hace | Publicado |
|---|---|---|
| `d100ae7` | Documento de estabilizacion | **Si** |
| `2cf7a3b` | Cerco que impide correr smoke tests fuera de una base de pruebas | No |
| `d50a22f` | La toma humana detiene las respuestas automaticas ya encoladas | No |
| `65e0007` | Invariantes del cotizador de servicios | No |
| `d8e9d68` | Inbox usable en telefono y PWA con cache segura | No |
| `59db0fb` | Notificaciones push acotadas por persona y workspace | No |
| `2c923a6` | Recepcion de archivos de WhatsApp | No |
| `e28ef9f` | El driver de disco sale del paquete de produccion | No |
| `c73ac86` | La puesta en marcha pide solo lo que el negocio necesita | No |

**Publicado:** solo `d100ae7` y lo anterior a el. Produccion corre ese codigo.

**Solo local:** los ocho restantes. Es deliberado: ninguno se publica sin
autorizacion expresa, y tres de ellos no pueden desplegarse antes de aplicar su
migracion.

---

## 3. Migraciones pendientes y orden de despliegue

Hay **26 migraciones** en el repositorio y **22 aplicadas** en produccion. Las
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
- **Sin base aislada, los smoke tests no corren.** Existen y estan protegidos,
  pero hoy son codigo sin ejecutar.

---

## 7. Pruebas no ejecutadas, y por que

| Suite | Por que no corrio |
|---|---|
| `smoke-critico.ts` (matriz de lanzamiento) | Necesita una base aislada; la unica disponible es produccion |
| `smoke-fase1` a `smoke-fase10` | Igual |
| `carga.ts` | Igual |
| Carreras de toma humana | Igual |
| Persistencia del cotizador | Igual |
| Estados de archivos recibidos | Base aislada **y** bucket |
| Entrega de push en telefono | Claves VAPID y un telefono real |
| Descarga de un archivo real | Bucket y un mensaje real con adjunto |

**La base aislada esta a una contrasena de distancia.** Esta maquina ya tiene
PostgreSQL 18 instalado y corriendo; no hace falta Docker ni un proveedor
nuevo. El procedimiento exacto esta en
[CRM_BETA_STABILIZATION.md](CRM_BETA_STABILIZATION.md#entorno-de-pruebas).

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

Una sola, y desbloquea mas que ninguna otra:

**Crear la base de pruebas local.** Necesita la contrasena del superusuario
`postgres` de esta maquina. Con ella se pueden ejecutar por primera vez todas
las suites que hoy son codigo sin correr, y recien ahi se sabra que de todo lo
construido en estas dos sesiones funciona de verdad contra una base.

Despues, en este orden:

1. Aplicar las cuatro migraciones en produccion.
2. Crear el bucket privado y cargar sus dos variables.
3. Generar las claves VAPID.
4. Publicar los ocho commits locales y verificar el health.
5. Recibir una foto, un audio y un PDF reales con el numero de prueba.
6. Cargar saldo en OpenAI y escuchar al agente responder de verdad.

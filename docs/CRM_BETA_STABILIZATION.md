# Estabilizacion de CRM Upzites beta

Actualizado: 14 de septiembre de 2026

Este documento registra el avance verificable del cierre tecnico de la beta. No
reemplaza `IMPLEMENTATION_STATUS.md`; distingue el codigo existente de las
pruebas realizadas con infraestructura o proveedores reales.

> El resumen de entrega —estado por funcionalidad, migraciones pendientes,
> variables nuevas, riesgos y la proxima accion concreta— esta en
> [CIERRE-BETA.md](CIERRE-BETA.md). Este archivo es el detalle tecnico detras
> de ese resumen.

## Linea base

- Rama: `master`.
- Commit de inicio: `eadd2b515c46cb32449df89ed0a65529978a9c3e`.
- Esquema: 66 modelos Prisma y 22 migraciones aplicadas en produccion.
- Produccion: `https://crm.upzites.com`.
- WhatsApp manual: recepcion y respuesta humana verificadas con el numero de
  prueba de Meta.
- Embedded Signup, coexistencia, PWA, push y descarga de medios: pendientes al
  iniciar esta estabilizacion.

## Migraciones creadas y no aplicadas en produccion

En orden. Cada bloque funcional exige la suya antes de desplegarse.

1. `20260914160000_human_takeover_outbox`
2. `20260914170000_push_notifications`
3. `20260914190000_whatsapp_media`

## Progreso

### Despliegue automatico de Vercel

Estado: configuracion externa corregida y validada mediante Git.

Valores anteriores de `upzites-crm`:

- Root Directory: raiz del repositorio.
- Framework Preset: Other.
- Build Command, Install Command y Output Directory: automaticos.
- Node.js: 24.x.
- Archivos fuera de Root Directory: habilitados.

El build de Git de `eadd2b5` compilaba ambas aplicaciones y fallaba al final
porque el preset Other esperaba un directorio `public` en la raiz.

Valores aplicados exclusivamente a `upzites-crm`:

- Root Directory: `apps/crm`.
- Framework Preset: Next.js.
- Build Command, Install Command y Output Directory: automaticos.
- Node.js: 24.x.
- Archivos fuera de Root Directory: habilitados para resolver el workspace y
  el lockfile del monorepo.

No se modificaron variables de entorno, dominios, certificados, migraciones ni
el proyecto Vercel de la web principal.

El push de `d100ae7` disparó un despliegue Git automático. El deployment
`dpl_7h9zYmS2CxdmNQckUMqRRLZssHah` quedó Ready, recibió el alias
`crm.upzites.com` y respondió HTTP 200 en `/api/system/health`.

### Entorno de pruebas

Estado: protecciones implementadas; ejecucion pendiente de una base aislada.

**Hallazgo (14 de septiembre):** esta maquina ya tiene **PostgreSQL 18
instalado y con el servicio corriendo**. La base aislada no necesita un
proveedor nuevo ni Docker: se crea local en un minuto. Lo unico que falta es la
contrasena del superusuario `postgres`, que no esta en el repositorio y que el
`pg_hba.conf` exige (`scram-sha-256` para local y para `127.0.0.1`).

Con esa contrasena, la secuencia completa es:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres crm_pruebas
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d crm_pruebas -c "comment on database crm_pruebas is 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1'"
```

Despues, en `apps/crm/.env.local` (sin versionar):

```text
TEST_DATABASE_URL=postgresql://postgres:LA_CONTRASENA@localhost:5432/crm_pruebas
TEST_DIRECT_URL=postgresql://postgres:LA_CONTRASENA@localhost:5432/crm_pruebas
```

Y entonces `pnpm test:db:deploy` y `pnpm test:smoke:all` pasan a ser
ejecutables. Eso desbloquea de una vez las validaciones pendientes de las
prioridades 2 a 8: carrera de toma humana, persistencia del cotizador, estados
de archivos recibidos y la pantalla de puesta en marcha con datos reales.

No existe `TEST_DATABASE_URL` ni una base aislada identificada. Los scripts
`smoke-fase*` y `smoke-critico.ts` crean y eliminan datos; no deben ejecutarse
con las variables normales de la aplicacion.

Todos los smoke tests pasan ahora por un cerco que:

- exige `TEST_DATABASE_URL` sin usar `DATABASE_URL` como respaldo;
- compara endpoint, usuario, base y project ref de Supabase contra
  `DATABASE_URL` y `DIRECT_URL`, reconociendo conexiones directas y poolers;
- exige que `TEST_DIRECT_URL`, si existe, llegue al mismo proyecto aislado;
- consulta un marcador independiente antes de importar el cliente Prisma;
- retira credenciales de proveedores y bloquea trafico HTTP externo.

En la base aislada, un administrador debe instalar una vez el marcador:

```sql
comment on database nombre_de_la_base_de_pruebas
is 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1';
```

Luego se configuran localmente, sin versionar sus valores:

```text
TEST_DATABASE_URL=conexion_pooler_o_directa_de_pruebas
TEST_DIRECT_URL=conexion_directa_del_mismo_proyecto_de_pruebas
```

Comandos seguros disponibles desde `apps/crm`:

```powershell
pnpm test:db:deploy
pnpm test:smoke
pnpm test:smoke:all
```

`test:db:deploy` usa `prisma migrate deploy`. El mismo cerco se ejecuta incluso
si alguien llama directamente a uno de los archivos `smoke-*.ts`.

### Toma de control humana

Estado: corrección implementada; integración con base aislada pendiente.

La pausa tiene alcance de conversación. Cada salida declara procedencia:
persona, IA, automatización, journey o evento transaccional. IA,
automatizaciones y journeys quedan sujetos a la toma humana; los mensajes
manuales y los eventos transaccionales legítimos continúan.

La cola, el worker, takeover y la reactivación se coordinan mediante bloqueo de
la fila de conversación y `lockVersion`. Takeover invalida la generación
anterior y cancela eventos `PENDING` o `PROCESSING`. El worker vuelve a validar
modo, generación, workspace y procedencia antes de reservar el envío.

`SENDING` marca el límite en que la llamada a Meta puede empezar. No se mantiene
una transacción durante la red. Si takeover encuentra una salida en ese estado,
la conserva e informa al operador: Meta podría haberla aceptado y no existe una
cancelación retrospectiva segura. Los mensajes cancelados quedan en estado
terminal y no reviven al devolver la conversación a la IA.

La migración `20260914160000_human_takeover_outbox` agrega únicamente los
valores `SENDING` y `CANCELLED` a los enums de mensaje y outbox. No necesita
backfill. Debe aplicarse antes de desplegar este bloque funcional.

Validación realizada: 12/12 unitarias de WhatsApp, Prisma validate, TypeScript,
ESLint sin errores y build de producción. Falta ejecutar los casos
transaccionales de carrera y aislamiento sobre la base aislada protegida.

### Configuración y cotizador

Estado: invariantes de código reforzadas; persistencia aislada pendiente.

- Guardar y publicar son acciones explícitas. Un admin puede dejar un borrador
  y el owner puede publicarlo desde la misma tarjeta.
- Una regla desactivada no se puede republicar mediante una URL antigua; se
  debe crear una versión nueva.
- Publicar exige que los campos y reglas formen una configuración que el motor
  realmente pueda calcular.
- La creación serializa numeración y versiones por workspace, valida contacto,
  oportunidad y conversación dentro del tenant y rechaza vínculos cruzados.
- La cotización conserva el rule set, entradas y desglose con los que fue
  calculada. Una revisión nace sin aprobación y una versión nueva no hereda la
  aprobación anterior.
- Aprobar o rechazar usa una actualización condicional: dos revisores no pueden
  resolver la misma solicitud con decisiones concurrentes.
- El envío por WhatsApp valida que el enlace firmado pertenezca a esa
  cotización y solo cambia el estado después de encolar el mensaje.
- Shopify continúa sin completar precios para la modalidad Servicios.

Validación realizada: 4/4 unitarias del motor de precios, 9/9 unitarias de
onboarding, TypeScript y ESLint sin errores. La creación, recarga, versionado,
publicación, desactivación y aprobación con datos reales siguen pendientes de
la base aislada marcada.

### Inbox móvil y PWA

Estado: implementación web completada; validación en teléfono real pendiente.

- El dashboard usa la altura visible del dispositivo y el detalle de Inbox
  conserva cabecera, acciones, mensajes y compositor sin solaparse con el menú.
- La lista reduce espacios y limita etiquetas en pantallas angostas. Las
  burbujas aprovechan el ancho móvil y el compositor respeta el área segura.
- Cada conversación conserva su borrador en el dispositivo. Un fallo de red no
  limpia ni envía el texto, y volver la conexión tampoco dispara un envío.
- Cerrar sesión elimina los borradores locales del CRM.
- El manifest instala la aplicación en modo standalone con iconos derivados
  del isotipo ya existente de Upzites.
- El service worker nunca cachea APIs, HTML autenticado, RSC, conversaciones,
  contactos ni tokens. Solo conserva la pantalla pública de desconexión,
  iconos y archivos estáticos de Next.js.
- Una actualización espera una acción del operador y avisa que los borradores
  se conservarán antes de recargar.

Validación realizada: TypeScript, ESLint sin errores, sintaxis del service
worker, build de producción, manifest (`standalone`, tres iconos), service
worker y pantalla offline con HTTP 200. La pantalla offline se inspeccionó en
el navegador local. El Inbox autenticado no se inspeccionó visualmente porque
no hay datos en una base aislada. Quedan pendientes instalación y pruebas de
teclado, rotación, reconexión y actualización en un Samsung S24 Ultra real.

### Notificaciones push

Estado: implementación completa en código; entrega real pendiente de claves y
base aislada.

- La suscripción se inicia únicamente al pulsar la campana y el permiso se pide
  en ese gesto. Cada navegador queda asociado al usuario y al workspace de la
  sesión; cerrar sesión elimina la asociación y la suscripción local.
- La pantalla bloqueada solo muestra textos discretos. No incluye nombres,
  teléfonos, mensajes, importes ni contenido de clientes.
- Una conversación asignada avisa solo a su responsable. Escalaciones,
  cotizaciones por aprobar y fallos operativos avisan a owner/admin; un mensaje
  entrante sin responsable no se difunde a todo el equipo.
- Cada persona controla cinco preferencias por dispositivo. Los endpoints
  vencidos o rechazados con 404/410 se eliminan; otros fallos usan la cola
  durable con un máximo de tres intentos.
- El clic abre solo rutas protegidas del CRM. El servidor vuelve a exigir sesión
  y aislamiento por workspace antes de mostrar datos.

La migración `20260914170000_push_notifications` agrega el trabajo `SEND_PUSH`
y la tabla `push_subscriptions`. No modifica ni rellena datos existentes. Debe
aplicarse antes de desplegar este bloque. Producción también necesita
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`; la clave privada debe
guardarse como secreto.

Validación realizada: 3/3 pruebas puras de política y contenido, sintaxis del
service worker, Prisma validate, instalación con lockfile congelado, TypeScript,
ESLint sin errores y build de producción. Falta probar alta, entrega, clic,
preferencias, renovación, cierre de sesión y eliminación de endpoints en un
dispositivo real conectado a una base aislada. No se generaron claves ni se
contactó a ningún proveedor push.

### Medios de WhatsApp

Estado: implementacion completa en codigo; falta el bucket y una recepcion real.

Meta no entrega el archivo en el webhook: entrega un identificador que caduca y
que hay que resolver y descargar desde el servidor con el token del canal. De
ahi salen las decisiones:

- La descarga es un trabajo de la cola (`DOWNLOAD_WHATSAPP_MEDIA`), no parte del
  webhook, que debe seguir respondiendo 200 rapido.
- El navegador nunca ve el token ni una URL de Meta. El archivo se guarda en
  almacenamiento propio y se sirve por `GET /api/media/[id]`, que vuelve a pedir
  sesion y resuelve el workspace dentro del `where`.
- La URL de descarga la propone Meta, o sea viene de fuera, y la peticion lleva
  el token. Se valida contra una lista de destinos antes de pedirla, y cada
  redireccion se sigue a mano para validarla tambien: seguirlas automaticamente
  seria mandar el token a donde diga la cabecera `Location`.
- El tipo lo declara quien envia, asi que se comprueba contra los primeros bytes
  del archivo. Una contradiccion se rechaza. `image/svg+xml`, HTML y XML no se
  guardan: son documentos con scripts, no imagenes.
- Solo se muestra dentro de la pagina lo confirmado por firma y de familia
  imagen, audio o video. Todo lo demas se descarga, con `nosniff`, CSP
  restrictiva y `Cross-Origin-Resource-Policy: same-origin`.
- Topes por tipo: imagen 5 MB, audio y video 16 MB, documento 25 MB. El tope de
  documento es menor que el de WhatsApp (100 MB) porque el archivo se descarga
  completo en memoria de una funcion antes de guardarlo.
- Estados visibles en la bandeja: descargando, no admitido, caducado en el
  proveedor, bloqueado por falta de configuracion, fallido y eliminado por
  retencion. Fallido y bloqueado ofrecen reintento.
- Retencion por defecto de 180 dias (`MEDIA_RETENTION_DAYS`). El mantenimiento
  diario borra el archivo y deja la fila como `PURGED`, para que la conversacion
  cuente que ahi hubo algo y por que ya no esta.
- Un adjunto recibido no se convierte en consentimiento de marketing: el consentimiento
  sigue siendo el de la conversacion y todo envio sigue pasando por `evaluateSend`.

Almacenamiento: se agrego una capa con dos implementaciones, bucket privado de
Supabase (REST, sin SDK nuevo) y disco local para desarrollo. El disco local se
rechaza explicitamente en produccion: el sistema de archivos de Vercel es
efimero y un archivo escrito ahi estaria perdido antes de que alguien lo abriera.

La migracion `20260914190000_whatsapp_media` agrega la tabla `media_assets`, el
enum `MediaAssetStatus` y el valor `DOWNLOAD_WHATSAPP_MEDIA`. No modifica datos
existentes. Debe aplicarse antes de desplegar este bloque.

Produccion necesita ademas `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y un
bucket privado (`MEDIA_STORAGE_BUCKET`, por defecto `crm-media`). La clave de
servicio es secreta y solo se usa en el servidor. Sin esas variables el sistema
no se rompe: los adjuntos quedan en `BLOCKED` con el motivo escrito, y el
mantenimiento los reencola solo en cuanto la configuracion exista.

Validacion realizada: 27 pruebas unitarias nuevas (12 de politica de archivos,
8 de destinos permitidos y extraccion desde el webhook, 7 de almacenamiento,
incluyendo claves que intentan salir del directorio), Prisma validate,
TypeScript y ESLint sin errores y build de produccion. No se descargo ningun
archivo real: no hay bucket configurado ni se envio nada a Meta. Falta recibir
una foto, un audio y un documento reales con el numero de prueba y comprobar la
bandeja en el telefono.

Fuera de alcance de este bloque: enviar archivos desde el CRM hacia el cliente.
Solo se implemento la recepcion, que es lo que pedia el piloto.

Protocolo de prueba pendiente, una vez exista el bucket y aplicada la migracion:

1. Crear el bucket privado en Supabase (Storage > New bucket, **sin** acceso
   publico) y cargar las tres variables en Vercel.
2. Desde el telefono de prueba, enviar al numero de WhatsApp: una foto con
   epigrafe, una foto sin epigrafe, un audio grabado y un PDF.
3. En la bandeja: los cuatro deben verse: la foto incrustada, el audio con
   reproductor, el PDF como descarga con su nombre y peso.
4. Comprobar que el PDF se descarga y **no** se abre dentro del CRM.
5. Abrir `/api/media/<id>` de un adjunto estando con sesion de otro workspace:
   debe responder 404, no 403.
6. Reenviar el mismo archivo: no debe duplicarse la fila ni volver a descargarse.

### Puesta en marcha

Estado: implementacion completa en codigo; falta verla con datos reales.

El problema no era que faltaran pasos, sino que sobraban. Todo paso cuya
funcion estuviera en el plan era obligatorio, sin mirar como vende el cliente:
a quien vende servicios se le exigia conectar una pasarela de pago para poder
activar, cuando cotiza y cobra por transferencia desde siempre. Pedir algo que
no se usa no protege a nadie; hace que el cliente abandone o configure de
mentira.

- **Lo exigido sale de la modalidad de venta, nunca del rubro.** Servicios:
  cobrar dentro del chat es opcional, porque el precio sale de una cotizacion.
  Productos fisicos y digitales: obligatorio, porque sin medio de cobro la
  compra no se termina. El correo con dominio propio solo es obligatorio para
  productos digitales, que es donde el acceso comprado viaja tambien por correo.
- **Cada requisito dice por que se pide.** Un requisito sin explicacion es
  indistinguible de un capricho, y el cliente lo resuelve mal o no lo resuelve.
- **Guardado, confirmado y probado dejan de ser lo mismo.** Un numero con las
  credenciales cargadas pero sin confirmar por Meta ya no aparece como "falta
  conectar" —el cliente sabe que lo hizo— sino como "a medias", diciendo que
  falta la confirmacion. Un dominio registrado esperando DNS igual. WhatsApp
  llega a "probado" solo cuando entro un mensaje real.
- **Se separo en tres grupos**: necesario para empezar, se puede agregar
  despues (cerrado por defecto) y no viene en tu plan. Lo opcional mostrado como
  deber hacia parecer la puesta en marcha tres veces mas larga de lo que es.
- **Se agrego el plan como paso.** Sin suscripcion, la lista de capacidades
  llegaba vacia y eso volvia opcional casi todo: se podia activar sin WhatsApp
  conectado. Ahora el plan es un requisito y, mientras no exista, los pasos que
  dependen de el dicen "depende del plan que elijas", no "tu plan no lo
  incluye", que seria falso.
- **Vender servicios con un plan sin cotizaciones** no vuelve el paso opcional
  —el agente seguiria sin poder ofrecer nada— sino que lo dice sin rodeos:
  cambia de plan o cambia la modalidad.
- **Publicar un seguimiento con pasos de correo** ahora exige dominio
  verificado. Antes se publicaba sin problema y los correos fallaban en
  silencio dias despues, sobre clientes reales, por `DOMAIN_NOT_VERIFIED`.
- Se reviso el texto mostrado al cliente: nada de valores internos ni de
  terminos de infraestructura. Una prueba automatica lo verifica.

Validacion realizada: 19 pruebas unitarias de onboarding (10 nuevas, con la
matriz completa de modalidades), TypeScript y ESLint sin errores, build de
produccion. La pantalla no se inspecciono con datos reales: hacerlo exige
iniciar sesion, y la unica base disponible es la de produccion. No se abrio.

Tambien se corrigieron las comprobaciones de `smoke-fase9.ts`, que habian
quedado desalineadas con el codigo: esperaban 10 pasos, un texto de ayuda que
ya no existe, y creaban un canal de WhatsApp sin credenciales ni verificacion,
que con las reglas actuales nunca habria permitido activar. **No se ejecutaron**:
siguen dependiendo de la base aislada.

## Verificaciones de la linea base

- Pruebas unitarias de WhatsApp: 20/20.
- Pruebas unitarias de onboarding: 19/19.
- Pruebas unitarias de precios: 4/4.
- Pruebas unitarias de push: 3/3.
- Pruebas unitarias de archivos recibidos: 12/12.
- Pruebas unitarias de almacenamiento: 7/7.
- Pruebas unitarias del cerco de pruebas: 6/6.
- Total: **71/71**, sin fallos.
- ESLint: 0 errores, 2 advertencias de estilo en archivos de configuracion.
- Build CRM: correcto con pnpm 11.3.0.
- Health de produccion: HTTP 200, base operativa y sin trabajos, outbox o
  webhooks fallidos al comprobarlo.

## Restricciones operativas

- Nunca ejecutar smoke tests, seeds, `migrate dev`, `db push` o `reset` contra
  produccion.
- Los cambios funcionales de esta estabilizacion quedan en commits locales
  hasta que exista autorizacion expresa para publicarlos.
- No activar IA, enviar comunicaciones reales, alterar WhatsApp ni crear
  credenciales de proveedores durante estas pruebas.

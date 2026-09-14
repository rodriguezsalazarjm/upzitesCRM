# Estabilizacion de CRM Upzites beta

Actualizado: 14 de septiembre de 2026

Este documento registra el avance verificable del cierre tecnico de la beta. No
reemplaza `IMPLEMENTATION_STATUS.md`; distingue el codigo existente de las
pruebas realizadas con infraestructura o proveedores reales.

## Linea base

- Rama: `master`.
- Commit de inicio: `eadd2b515c46cb32449df89ed0a65529978a9c3e`.
- Esquema: 66 modelos Prisma y 22 migraciones aplicadas en produccion.
- Produccion: `https://crm.upzites.com`.
- WhatsApp manual: recepcion y respuesta humana verificadas con el numero de
  prueba de Meta.
- Embedded Signup, coexistencia, PWA, push y descarga de medios: pendientes al
  iniciar esta estabilizacion.

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

## Verificaciones de la linea base

- Pruebas unitarias de WhatsApp: 12/12.
- Pruebas unitarias de onboarding: 9/9.
- Pruebas unitarias de precios: 4/4.
- Pruebas unitarias de push: 3/3.
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

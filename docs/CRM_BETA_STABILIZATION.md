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

Estado: configuracion externa corregida; validacion mediante Git en curso.

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

### Entorno de pruebas

Estado: pendiente.

No existe `TEST_DATABASE_URL` ni una base aislada identificada. Los scripts
`smoke-fase*` y `smoke-critico.ts` crean y eliminan datos; no deben ejecutarse
con las variables normales de la aplicacion.

### Toma de control humana

Estado: riesgo confirmado, correccion pendiente.

El modo `HUMAN_ACTIVE` impide nuevas ejecuciones y nuevos mensajes de IA. El
worker del outbox no vuelve a comprobar modo y procedencia justo antes del
envio, por lo que una respuesta automatica ya encolada podria salir despues de
la toma de control.

## Verificaciones de la linea base

- Pruebas unitarias de WhatsApp: 7/7.
- Pruebas unitarias de onboarding: 9/9.
- Pruebas unitarias de precios: 4/4.
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

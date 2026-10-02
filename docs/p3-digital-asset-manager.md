# Punto 3 — Digital Asset Manager / Entrega digital

Qué recibe el comprador después de pagar, configurado por el OWNER/ADMIN desde
**Productos → [Producto] → Entrega digital**, sin código, metadata, SQL, scripts
ni Storage manual.

## Flujo

```
Productos → Entrega digital (UI)
  └─ DigitalAsset (archivo privado o enlace, orden, activo/inactivo)
Pago aprobado (webhook MP o venta simulada) → processOrderPayment
  └─ grantDigitalDelivery: UNA DigitalDelivery por pedido (bundleOrderId único)
       └─ DigitalDeliveryItem: copia de cada asset activo (main + bump, en orden)
  └─ sendDelivery('initial'): WhatsApp/email existentes → SENT / FAILED / AVAILABLE
Comprador: /checkout/[id] (post-pago) → "Acceder a mi compra" → /d/<token>
  └─ /d/<token>/<item>: valida token + item + revocación → URL firmada (60 s) o redirect del enlace
Equipo: /pedidos/[id] → estado, intentos, contenido, historial, Reenviar, Copiar enlace, Revocar
```

No hay pipeline paralelo: se extendió `processOrderPayment`, `grantDigitalDelivery`,
`DigitalAsset` y `DigitalDelivery` existentes. Mismo checkout, misma venta simulada.

## Modelo (migración `20261002200000_digital_asset_manager`)

- `DigitalAsset`: + `format` (PDF/AUDIO/ZIP/VIDEO/LINK), `mimeType`, `sizeBytes`,
  `fileName`, `position`, `isActive`, `archivedAt`, `updatedAt`.
- `DigitalDelivery`: pasa a ser una por pedido (`bundleOrderId` único) con
  `tokenVersion`, `attempts`, `lastAttemptAt`, `lastError`, `updatedAt`.
  `assetId` queda nullable (solo filas anteriores, una por asset) y su FK pasa de
  CASCADE a SET NULL: borrar un asset nunca borra lo entregado.
- `DigitalDeliveryItem` (nuevo): snapshot del asset al pagar (nombre, tipo,
  destino, MIME, tamaño, contador de accesos). FK al asset SET NULL.
- `DeliveryStatus`: `GRANTED` se renombró a `AVAILABLE` (RENAME VALUE, conserva
  filas) y se agregó `FAILED`. `ACCESSED` queda solo para filas anteriores.
- Datos: posiciones iniciales por fecha y un item por cada entrega anterior.

## Decisiones

- **Estados**: AVAILABLE = el enlace existe y funciona; SENT = un canal existente
  lo envió; FAILED = un canal se intentó y falló. Sin ningún canal disponible
  (sin dominio de email ni WhatsApp) queda AVAILABLE con el motivo: no se finge
  envío ni fallo. FAILED **no** bloquea al comprador (el fallo fue del aviso).
- **Email**: no se adelantó el Punto 25. Se reutiliza `notifyDigitalDelivery`
  (WhatsApp + email operacional). El proveedor guionado de dev/demo se marca como
  "email simulado (sin envío real)" en historial y mensajes.
- **Token**: HMAC del secreto del servidor sobre `id + tokenVersion` (256 bits).
  La base guarda solo su hash; la página post-compra (protegida por el enlace
  firmado del checkout) puede volver a mostrarlo sin guardarlo en claro. No se
  audita ni se loguea. Reenviar mantiene el enlace; revocar es definitivo.
  Una entrega anterior (token aleatorio) recibe un token derivado al reenviarla.
- **Snapshot**: editar, desactivar, reemplazar o borrar un asset solo afecta a
  compras futuras. Reemplazar sube un objeto NUEVO; el entregado se conserva.
  Borrar un asset ya entregado lo archiva (oculto, no se entrega más) y conserva
  su archivo; uno nunca entregado se borra de verdad (fila y objeto).
- **Sin contenido**: un producto DIGITAL vendido sin assets activos no crea
  entrega; se audita, se levanta una alerta CRITICAL al negocio y la página del
  comprador dice que el vendedor le enviará el acceso (no muestra una página vacía).
  PHYSICAL/SERVICE solo entregan si tienen assets explícitos (opcional en la UI).
- **Descargas**: tope de 20 accesos por archivo (columna existente
  `maxDownloads`), contado al abrir cada contenido; ver la página no cuenta.
- **Video**: archivo MP4 hasta 50 MB; videos más pesados, como enlace (Vimeo,
  YouTube no listado, Drive) con formato "Video".
- **Vista previa**: requiere sesión, workspace y rol; no usa el token del
  comprador ni toca entregas. En Supabase es una URL firmada de 60 s; con el disco
  local la sirve la API (audio/video inline, PDF/ZIP como descarga, `nosniff` y
  CSP `sandbox`).
- **Roles**: gestionar assets = `canManageWorkspaceSettings` (OWNER/ADMIN, igual
  que el Studio); reenviar/revocar = `canManageChannels` (OWNER/ADMIN, igual que
  el reenvío existente). MEMBER puede ver la lista. El agente IA no tiene
  herramientas de entrega.

## Storage

- Bucket **separado** `DELIVERY_STORAGE_BUCKET` (recomendado `deliverables`).
  `media` (portadas) no se toca: sigue privado, 5 MB, jpeg/png/webp. Nunca se cae
  al bucket de medios: sin la variable, la subida responde 503 y la UI ofrece
  solo enlaces.
- Subida: el navegador pide una **intención firmada** (HMAC con workspace,
  producto, clave, tipo y vencimiento de 2 h) y sube DIRECTO al bucket con una URL
  firmada de Supabase (sin el tope de 4,5 MB de las funciones de Vercel). Al
  confirmar, el servidor lee los primeros 4 KB (`Range`) y decide por la firma;
  si no es PDF/audio/ZIP/MP4 válido, borra el objeto.
- Claves: `deliverables/<workspaceId>/<productId>/<uuid>.<ext>`, generadas por el
  servidor; el nombre original nunca forma parte de la ruta.
- MIME admitidos: `application/pdf, application/zip, audio/mpeg, audio/mp4,
  audio/wav, audio/ogg, audio/aac, video/mp4`. Tope 50 MB.
- URLs externas: solo `https://`, sin credenciales; se valida la forma, nunca se
  descargan (sin SSRF). Se revalidan al redirigir.

### Configuración manual (una vez)

Supabase → Storage → New bucket:

| Campo | Valor |
| --- | --- |
| Name | `deliverables` |
| Public bucket | **OFF** |
| Restrict file upload size | 50 MB |
| Allowed MIME types | `application/pdf, application/zip, audio/mpeg, audio/mp4, audio/wav, audio/ogg, audio/aac, video/mp4` |

Sin políticas RLS públicas: el servidor usa la service role key existente.

Vercel (proyecto del CRM) → Settings → Environment Variables:
`DELIVERY_STORAGE_BUCKET=deliverables` en Production y Preview → Redeploy.
No hace falta ninguna secret nueva.

Local, para la prueba real: agregar `DELIVERY_STORAGE_BUCKET=deliverables` a
`apps/crm/.env.storage.local` y correr
`node scripts/run-against-test-db.mjs scripts/qa-storage-deliverables.ts`.

## Pruebas

| Qué | Comando (desde `apps/crm`) |
| --- | --- |
| Unidad (reglas, token, estados, storage) | `npm run test:commerce`, `npm run test:storage` |
| Integración por rutas (crm_pruebas, disco local) | `pnpm exec tsx scripts/smoke-digital-delivery.ts` |
| E2E por la UI (servidor `crm-preview-visual` :3101) | `npm run test:e2e:delivery` |
| Storage real (Supabase) | `node scripts/run-against-test-db.mjs scripts/qa-storage-deliverables.ts` |

Los smokes anteriores que contaban una entrega por asset (`smoke-fase5`,
`smoke-commerce-ledger`) se actualizaron al modelo de una entrega por pedido con
sus items; las garantías que verifican (idempotencia, main + bump, revocación por
reembolso) son las mismas.

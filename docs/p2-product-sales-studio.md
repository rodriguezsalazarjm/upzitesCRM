# Punto 2 — Product Sales Studio

Un OWNER o ADMIN gestiona desde la interfaz la parte comercial básica de un
producto: datos, portada, tipo, estado, moneda, precio, variantes, SKU,
producto adicional en el checkout (order bump), vista previa, publicación,
enlace de compra público, duplicación, archivo y métricas básicas. Nadie
edita JSON, metadata ni la base.

## Arquitectura

Sin modelos nuevos ni migraciones: se extienden `Product` / `ProductVariant`
y se reutiliza el checkout y el motor de order bump del Punto 1.

| Pieza | Dónde |
| --- | --- |
| Reglas puras (validación, dinero, SKU, variantes, publicación, bump) | `apps/crm/src/lib/commerce/product-studio/rules.ts` |
| Servicio de dominio (crear, guardar, estados, duplicar, portada, métricas) | `.../product-studio/service.ts` |
| Portada (storage + verificación de bytes) | `.../product-studio/cover.ts` |
| Errores → HTTP | `.../product-studio/http.ts` |
| Enlace público firmado `/comprar/[id]?k=` | `apps/crm/src/lib/commerce/product-link.ts` |
| Compra pública → pedido → checkout canónico | `apps/crm/src/lib/commerce/product-checkout.ts` |
| UI | `src/app/(dashboard)/productos/**`, `src/components/products/*`, `src/app/comprar/[id]` |
| APIs | `POST /api/products/studio`, `GET/PATCH /api/products/[id]`, `POST /api/products/[id]/status`, `POST /api/products/[id]/duplicate`, `GET/POST/DELETE /api/products/[id]/cover`, `POST /api/comprar/[id]` |

### Modelo de datos (sin migración)

- **Precio base** = variante `isDefault`. Con variantes, la por defecto queda
  inactiva y el comprador elige una de las activas (`sellableVariants`).
- **Dinero**: enteros en unidades menores ISO 4217 (convención de
  `lib/billing/money`): CLP exponente 0, USD exponente 2.
  `ProductVariant.priceMinor` (antes `priceClp`; la columna sigue siendo
  `price_clp` vía `@map`, sin migración) guarda ese entero en la moneda del
  producto. Formato y precio con moneda: `lib/commerce/money`
  (`formatMinor`, `priceView`, `textMentionsPrice`). La
  conversión a unidades mayores ocurre solo en el borde con Mercado Pago
  (`toMajorUnits` al crear la preferencia, `providerAmountToMinor` en el
  webhook). Para CLP ambas son identidad.
- **Order bump**: `Product.metadata.orderBump.variantId`, la clave que ya lee
  el motor del Punto 1. El Studio la escribe validada.
- **Portada**: `Product.metadata.cover = { key, mimeType, size, uploadedAt }`;
  archivo en `products/<workspaceId>/<productId>/<uuid>.<ext>` del storage de
  medios (Supabase en producción, disco en desarrollo).
- **SKU**: opcional, normalizado (`cam s` → `CAM-S`), único **por workspace**
  (validado bajo lock de catálogo; no hay constraint global).

### Estados

| Estado | Compra pública | Studio |
| --- | --- | --- |
| DRAFT (Borrador) | No (la página dice "no disponible", sin datos) | Editable, vista previa |
| ACTIVE (Publicado) | Sí, por el enlace firmado | Editable si sigue siendo vendible |
| ARCHIVED | No; pagos pendientes tampoco | Solo lectura; "Restaurar" → DRAFT |

Archivar nunca borra: pedidos, pagos, ledger y métricas se conservan. Una
variante quitada que ya tiene pedidos se **desactiva** en vez de borrarse.
Archivar un producto quita su relación de adicional en los productos que lo
ofrecían (auditado); despublicarlo la deja con aviso y el checkout no lo
muestra.

### Flujo de compra

1. `/comprar/[id]?k=<firma>`: el comprador elige variante y deja nombre y
   email. El formulario no envía montos (y si los envía se ignoran).
2. `POST /api/comprar/[id]`: valida la firma, que el producto esté ACTIVE y la
   variante (del producto, activa, con precio); crea/relaciona el contacto
   sin sobrescribirlo y llama a `createOrder` (precio del catálogo, moneda del
   producto). Redirige al **publicUrl canónico** `/checkout/[orderId]?t=`.
3. El checkout del Punto 1 ofrece el adicional y recalcula el total bajo lock.

### Venta simulada

Reutiliza la demo existente (`isLocalDemo()`: `LOCAL_VISUAL_TEST=1` **y** el
preload visual con la red externa bloqueada). En ese modo el checkout redirige a
`/demo-checkout/[id]`, que exige sesión OWNER/ADMIN del workspace del pedido y
llama a `processOrderPayment` con el total **guardado** del pedido. El
`Payment` y la auditoría `order.payment_confirmed` quedan con
`simulated: true`; las métricas del Studio lo indican. En producción
`isLocalDemo()` es falso: la página y la ruta responden 404.

### Métricas

`productMetrics`: pedidos iniciados (no cancelados), ventas confirmadas,
unidades e ingresos confirmados por moneda. Venta = `SOLD_ORDER_STATUSES`
(CONFIRMED/PROCESSING/FULFILLED), la misma definición del dashboard. Pagos
con monto/moneda/preferencia que no coinciden no confirman el pedido y no
suman.

## Seguridad

- Toda mutación: sesión válida → workspace activo verificado por membership
  (`requireCurrentUser`) → rol OWNER/ADMIN (`canManageWorkspaceSettings`) →
  entitlement `commerce.products` → recurso acotado por `workspaceId` (otro
  negocio = 404).
- Whitelist estricta (`productInputSchema.strict()`): `status`, `workspaceId`,
  `metadata` o cualquier otra clave → 400.
- Variantes: ids del cliente solo valen si son del producto; en la compra se
  eligen entre las vendibles del producto.
- Bump: nunca el mismo producto (también en el motor del Punto 1:
  `productId: { not }`), nunca otro workspace, misma moneda, activo, con
  precio. El checkout solo acepta el booleano `includeBump`.
- Descripción: texto plano, se renderiza escapada (`whitespace-pre-line`).
- Portada: tipo por firma de bytes (JPEG/PNG/WebP), 5 MB, sin SVG; se sirve
  con `nosniff`, CSP `sandbox` y solo con la firma del enlace + producto
  publicado, o con sesión del workspace dueño.

## Pruebas

- `npm run test:commerce` (incluye `product-studio/rules.test.ts` y
  `product-link.test.ts`).
- `npm run test:commerce` incluye también `money.test.ts` (CLP 19.990 + 2.990 =
  22.980 sin división por 100; USD 19.99 + 2.99 = 22.98 en centavos).
- `scripts/smoke-product-studio.ts` (en `test:smoke:all`): incluye enlace
  público (firma válida/ausente/manipulada, DRAFT/ACTIVE/ARCHIVED, otro
  workspace) y multi-moneda (OrderLine, total, pago simulado, formato,
  métricas, mezcla CLP/USD rechazada, dashboard por moneda y agente).
- Storage real: `node scripts/run-against-test-db.mjs scripts/qa-storage-cover.ts`
  con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `MEDIA_STORAGE_BUCKET` en
  `apps/crm/.env.storage.local` (ignorado por git). Base de pruebas, bucket real.
- E2E (Playwright, `tests/c2/product-studio.spec.ts`): con el servidor visual
  (`npm run visual:dev` o el lanzador `crm-preview-visual`, :3101) corre
  `npm run test:e2e:studio`, que primero rehace la base de cuentas
  (`visual:studio`: una cuenta OWNER de A y ADMIN de B, sin productos).
  Cubre: hito completo por UI, aislamiento al cambiar de negocio, listado
  (filtros, duplicar, archivar, despublicar), responsive móvil/tablet y
  teclado/foco. No editar `src/` mientras corre: el servidor de desarrollo
  recarga la pestaña.

## Consumidores de precios auditados

Catálogo y pedidos (`orders.ts`, `product-checkout.ts`, `public-checkout.ts`,
Studio, duplicar, métricas por moneda) ya operaban en la moneda del producto.
Se corrigieron los que asumían CLP: el agente (`agents/tools.ts` entrega
`price: { amountMinor, currency, display }` y `total` con moneda; la
confirmación de oferta usa `textMentionsPrice`), el proveedor demo local, el
resumen de conversación, la actividad de pago confirmado, el demo checkout y
los widgets de Commerce del dashboard (solo la moneda del negocio, en
unidades mayores). `SubscriptionPlan.priceClp` (SaaS) y `unitPriceClp` del
cotizador son otros dominios y no cambian. La sincronización de Shopify
(anterior al Studio) asume una tienda en CLP; está documentado en
`shopify/sync.ts`.

## Producción

La portada necesita el storage de medios configurado (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `MEDIA_STORAGE_BUCKET`). Sin él, subir una
portada responde 503 con un mensaje claro y el resto del Studio funciona.

Verificado contra el bucket real `media` (privado, 5 MB, jpeg/png/webp) con
`scripts/qa-storage-cover.ts`. Dos compatibilidades del driver de Supabase
(`lib/storage`): `SUPABASE_URL` se reduce a su origen (una URL pegada como
`.../rest/v1/` funciona igual) y un objeto inexistente, que Supabase informa
como HTTP 400 `NoSuchKey`, se trata como "no existe" al leer y al borrar.

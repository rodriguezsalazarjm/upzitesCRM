# Punto 6 — Order bump y upsell postcompra

## Qué resuelve

Antes había un solo order bump, guardado en `products.metadata.orderBump`. Solo se elegía la variante: no tenía copy, imagen ni precio propio, nada lo medía y no había upsell. Ahora, desde **Productos → [Producto] → Ofertas**, el negocio configura:

- **Order bump:** una casilla opcional en el checkout que se suma al mismo pago.
- **Upsell postcompra:** se ofrece una vez confirmado el pago. Si el comprador acepta, paga aparte.

Cada oferta tiene producto ofrecido, título, descripción, precio especial opcional, imagen (la portada del producto ofrecido), activación y prioridad, y muestra su resultado (mostrada / aceptada / pagada / take rate / ingresos).

## Modelo de datos

Migración `20261102120000_product_offers`:

- `product_offers`: `kind` (ORDER_BUMP | UPSELL), `product_id`, `offer_variant_id`, `headline` (1–120), `description` (≤ 400), `price_minor` (NULL = precio de la variante; si existe, > 0), `show_image`, `priority`, `is_active`, `archived_at`.
  - FK compuestas `(id, workspace_id)` al producto y a la variante.
  - La variante usa `ON DELETE RESTRICT`.
- `order_offers`: `(order_id, offer_id)` es único y el estado es SHOWN | ACCEPTED | DECLINED.
  - `result_order_id` (único) apunta al pedido adicional del upsell.
  - Alimenta la medición y la idempotencia.
- **Backfill:** cada `metadata.orderBump.variantId` existente se convierte en una oferta ORDER_BUMP con el título "Agregar también …" y se borra la clave de metadata. Verificado en `crm_pruebas`: 1 oferta creada, 0 restos.

## Reglas

- **Prioridad:** se muestra **una** oferta por tipo, la primera disponible. Las demás quedan de respaldo. Una oferta queda fuera si:
  - está pausada o archivada;
  - el producto ofrecido no está publicado;
  - la variante está inactiva o sin stock;
  - la moneda es distinta;
  - es el mismo producto.
- **Máximo:** 5 ofertas por tipo.
- **Reordenar:** hay que enviar la lista completa. Si el orden viene de una versión vieja, la respuesta es CONFLICT.
- **El precio lo pone el servidor.** El checkout lee la oferta de la base. El navegador solo envía la casilla, y el monto final lo recalcula el servidor.
- **Permisos:** OWNER/ADMIN mutan (`canManageWorkspaceSettings`) y MEMBER solo lee. Todo requiere `commerce.products`.
- **Bloqueos y auditoría:** cada mutación toma el advisory lock del catálogo y queda auditada (`product.offer_created|updated|deleted|archived`, `product.offers_reordered`).
- **Eliminar:** una oferta con historial se archiva para no perder la medición. Sin historial, se borra.
- **Coherencia del catálogo:**
  - Archivar un producto pausa las ofertas que lo ofrecen.
  - Duplicar un producto copia sus ofertas.
  - No se puede cambiar la moneda mientras haya ofertas en otra.
  - Una variante referenciada se desactiva en vez de borrarse.

## Checkout

- **Bump:** al cargar un pedido PAYABLE se registra SHOWN. Al pagar:
  - la casilla marcada agrega la línea con el precio de la oferta y registra ACCEPTED;
  - la casilla desmarcada registra DECLINED.
  - Si la prioridad cambió entre intentos, se quitan las líneas viejas del bump y se limpian sus decisiones.
- **Upsell:** con el pedido PAID, `/checkout/[id]` muestra la oferta (SHOWN). La pantalla tiene dos botones, "Sí, lo quiero por $X" y "No, gracias".
  - **Por qué un pedido aparte:** Mercado Pago Checkout Pro no permite cobrar de nuevo sin una nueva autorización del comprador. Por eso aceptar crea un **pedido adicional** (`metadata.source = 'upsell'`, `parentOrderId`) con su propia preferencia de pago.
  - **Sin cascada:** el pedido adicional no lleva bump ni otro upsell.
  - **Idempotencia:** un advisory lock por pedido más el `(order_id, offer_id)` único hacen que el doble clic y la concurrencia produzcan un solo pedido adicional.
  - Aceptar de nuevo lleva al mismo pago.
  - La entrega digital y el ledger se aplican al adicional como a cualquier pedido.
- **Medición:**
  - Take rate del bump = pedidos pagados que lo incluyeron / pedidos pagados en que se mostró.
  - Take rate del upsell = pedidos adicionales pagados / veces que se mostró.
  - Los pagos del modo demo se cuentan aparte y se rotulan como simulados.

## UI

- **`/productos/[id]/ofertas`:** dos tarjetas (Order bump y Upsell postcompra).
  - Cada tarjeta muestra la lista con prioridad, el estado (Se muestra / Respaldo / Pausada / No disponible), los resultados, un interruptor de activación, subir/bajar, editar y eliminar (con confirmación).
  - Un editor lateral incluye la vista previa en vivo, y una tabla de resultados que incluye las ofertas eliminadas que tenían medición.
- **Ficha del producto:** nueva tarjeta "Ofertas" con el resumen. El editor del producto ya no tiene el selector de bump.
- **Vista previa del recorrido:** tiene un tercer paso, "Después del pago", con el upsell.

## Verificación

- **`npm run test:commerce`:** 65 tests. 10 son nuevos en `offers/rules.test.ts`: schemas estrictos, precio efectivo, prioridad, aislamiento, medición.
- **`npm run test:smoke:offers`:** 32 checks contra `crm_pruebas`, por las rutas reales, con el cobro en modo demo, en las secciones A–I:
  - configuración;
  - roles;
  - aislamiento A/B;
  - prioridad;
  - bump en el checkout;
  - upsell (rechazar, aceptar, doble clic, concurrencia, tokens);
  - pago y entrega del adicional (un monto que no coincide no confirma);
  - medición;
  - coherencia del catálogo.
- **Smokes adaptados al nuevo modelo:**
  - `smoke-product-studio` 53/53
  - `smoke-commerce-ledger` 29/29
  - `smoke-digital-delivery` 73/73
- **Resto:** `test:foundation` 46/46 (con la nueva entrada en la allowlist cross-tenant), `test:smoke:all`, lint, TypeScript y build.
- **QA en el navegador (`crm-preview-visual`, :3101):**
  - Se crearon el bump ($12 en vez de $19) y el upsell ($29 en vez de $49) desde la UI, con vista previa en vivo.
  - Compra en 375 px: el bump aparece, el total pasa de $99.90 a $111.90 y el pago es simulado.
  - El upsell aparece tras el pago. Al aceptar se crea el pedido adicional de $29 con su pago simulado.
  - En la base, los dos pedidos quedan CONFIRMED, el hijo queda enlazado al padre, los OrderOffer quedan ACCEPTED y la auditoría registra `order.upsell_accepted`.
  - Los resultados muestran 1/1/1, take rate 100% y "2 pagos simulados".
- **Bugs corregidos en la QA:**
  - El botón "Agregar" en la cabecera de la tarjeta comprimía la descripción a una palabra por línea con 1025 px; ahora va debajo de la lista.
  - Con 375 px, la grilla tomaba el ancho mínimo de la tabla de resultados (560 px) y desbordaba en horizontal; la corrige `grid-cols-[minmax(0,1fr)]`.

**Los pagos se validaron solo en modo demo (simulados).** Falta un ida y vuelta real con Mercado Pago TEST: bump incluido en la preferencia, pago aprobado por webhook, upsell con su segunda preferencia.

## Pendiente del propietario

- Aplicar la migración `20261102120000_product_offers` en producción (incluye el backfill), junto con las pendientes anteriores.
- Prueba real con Mercado Pago TEST del bump y del upsell.

## Deliberadamente fuera

- One-click upsell sin nueva autorización (Checkout Pro no lo permite).
- Downsell.
- Cadenas de varios upsells.
- Pruebas A/B entre ofertas.
- Ofertas por segmento o por canal.
- Imagen propia de la oferta distinta a la portada del producto.
- Descuentos porcentuales.

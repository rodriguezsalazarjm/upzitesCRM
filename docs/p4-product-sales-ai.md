# Punto 4 — Product Sales Brain

## Arquitectura

El Punto 4 extiende el runtime existente; no crea un segundo sistema de agentes.

```text
Reglas de plataforma / seguridad
  + instrucciones globales de AgentVersion y WorkspaceProfile existentes
  + ProductSalesBrain del productId fijado en Conversation
  + resumen e historial reciente de Conversation
  + mensaje no confiable del lead
        ↓
runAgent / provider existente
        ↓
tools existentes, acotadas por ToolContext.workspaceId + productId
```

`src/lib/product-sales-brain/context.ts` es la única capa que construye el contexto comercial del producto. Nunca consulta el catálogo completo: carga por `(workspaceId, productId)` y emite secciones deterministas para hechos, cliente, propuesta de valor, FAQs, objeciones, prueba social, garantía, políticas, comportamiento, prohibiciones, checkout y handoff.

## Schema y aislamiento

`ProductSalesBrain` es una entidad 1:1 con `Product`. Contiene los campos de entrenamiento y dos listas JSON validadas y ordenadas (`faqs`, `objections`). La migración `20261002210000_product_sales_brain` agrega además `Conversation.productId`.

Las relaciones a producto usan claves foráneas compuestas `(product_id, workspace_id)`. Esto impide asociar un brain o una conversación a un producto de otro workspace incluso si una validación de aplicación fallara. Hay índices para las búsquedas por tenant/producto y `updatedAt` actúa como versión observable sin crear un version manager.

## Límites y estado

Los límites están centralizados en `src/lib/product-sales-brain/rules.ts`:

- textos comunes: 4.000 caracteres;
- instrucciones especiales: 8.000;
- pregunta/respuesta individual: 1.000;
- máximo 30 FAQs y 30 objeciones;
- payload Zod `strict`, sin `workspaceId`, `productId`, precio, moneda ni estado interno.

El estado es determinista: `EMPTY`, `PARTIAL` o `READY`. No se presenta un porcentaje de “calidad IA”.

## UI

La ruta `Productos → [Producto] → IA de ventas` ofrece:

- producto, cliente ideal y propuesta de valor;
- editores repetibles de FAQs y objeciones;
- prueba social, garantía y políticas;
- tono, prohibiciones, reglas de preguntas/oferta/checkout/insistencia/stop/handoff e instrucciones especiales;
- estados vacío/parcial/listo, guardando/error/cambios sin guardar;
- simulador con reinicio, respuesta, handoff y enlace de checkout.

La superficie sigue el sistema visual del Product Sales Studio y conserva labels, descripciones asociadas, nombres accesibles y layout sin overflow en 1440, 820 y 390 px.

## Runtime y jerarquía de instrucciones

`runAgent` lee `Conversation.productId`, carga el brain del mismo workspace y entrega las capas separadas a `buildInstructions`. El mensaje del lead permanece como mensaje `user`; nunca participa en workspace/product/tool selection.

El simulador de producto crea/reutiliza una conversación de laboratorio, la asocia server-side al producto autorizado y llama al mismo `runAgent`, provider y tools. El provider local determinista usa el mismo contrato para CI. En modo simulador solo `createCheckoutLink` puede ejecutar su efecto: crea un pedido `DRAFT` y un link firmado, nunca cobra.

## Tool boundaries y checkout

`ToolContext` incluye el `productId` fijado por el servidor. En conversaciones ligadas a producto:

- búsqueda/detalle/inventario quedan acotados al producto activo;
- `create_checkout` rechaza variantes ajenas o productos no `ACTIVE`;
- `createCheckoutLink` usa schema vacío: el modelo no puede enviar producto, workspace, precio, moneda ni URL;
- el servidor recupera variante, `priceMinor`, currency y estado persistidos;
- `createOrder`, `createOrderCheckout` y `publicCheckoutUrl` siguen siendo el flujo canónico del Punto 2;
- el order bump sigue resolviéndose en el checkout existente;
- `DRAFT` y `ARCHIVED` no generan links comprables.

## Seguridad y auditoría

La edición requiere sesión y rol OWNER/ADMIN. Todas las lecturas y mutaciones comprueban el workspace. Crear/actualizar training escribe `AuditLog` sin prompt completo, tokens ni secretos. Los runs registran metadata segura (`productId`, `productContextId`, `updatedAt`) en la respuesta interna del simulador, no exponen el system prompt ni chain-of-thought.

Las reglas del Product Brain influyen en FAQ, objeciones, prohibiciones, datos desconocidos, stop, checkout y handoff. La entrada del lead no puede cambiar el producto activo ni tool permissions.

## Provider

Se reutiliza `OpenAIProvider` (Responses API, `OPENAI_API_KEY`/`OPENAI_PROJECT_ID`) y `LocalKnowledgeProvider` para pruebas deterministas. No se agregó proveedor, SDK, modelo ni variable nueva. El smoke real solo debe ejecutarse donde `OPENAI_API_KEY` ya esté configurada; nunca se registra ni se envía al cliente.

## Verificación

- pruebas puras: límites, estado, Alpha/Beta, capas global/producto, CLP/USD y mass assignment;
- smoke DB: CRUD, persistencia, FAQs/objeciones, RBAC, 404, cross-tenant, inyección, prohibiciones, stop, handoff, checkout y DRAFT/ARCHIVED;
- E2E: creación de producto por UI, training por UI, recarga, publicación, FAQ, objeción, confirmación, checkout firmado, nombre/precio/moneda y aislamiento de workspace;
- regresiones: agentes, commerce, foundation, entitlements, Product Sales Studio, commerce ledger, Digital Delivery, lint, TypeScript y build.

## Deliberadamente fuera

No se construyó Knowledge Base global, RAG, embeddings, vector search, crawler, ingestión documental, Campaign Routing, follow-up scheduler, WhatsApp/Instagram Manager, Flow Builder nuevo, upsells postcompra, email, analytics, attribution ni router multi-producto. El código únicamente consume el contexto global que ya existía.

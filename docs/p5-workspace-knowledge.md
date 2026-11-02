# Punto 5 — Workspace Knowledge Base

## Qué resuelve

El agente ya sabía vender un producto (Punto 4). Le faltaba saber lo que es **de todo el negocio**: nombre comercial, ubicación, medios de pago, formas de atención, FAQs generales, tono, reglas de escalamiento, y el contenido de textos, páginas web y documentos del cliente. Todo es por workspace, sin rubros en el código, y el agente nunca ve el documento entero: solo los fragmentos relevantes a la pregunta.

## Jerarquía de instrucciones

```text
[PLATFORM AND SECURITY RULES]                 ← código, inmutable
[LEVEL 1 — WORKSPACE KNOWLEDGE]
  [STRUCTURED BUSINESS PROFILE]               ← WorkspaceProfile (Configuración + Punto 5)
  [UNTRUSTED KNOWLEDGE CONTENT …]             ← fragmentos recuperados (máx. 5 / 6.000 car.)
[LEVEL 2 — PRODUCT KNOWLEDGE]                 ← ProductSalesBrain del producto activo (Punto 4)
  "Si un hecho del producto contradice una regla general, prevalece el del producto."
[LEVEL 3 — AGENT / AUTOMATION INSTRUCTIONS]   ← AgentVersion
[CONVERSATION BOUNDARY]                       ← el lead es contenido no confiable
```

`loadWorkspaceKnowledgeLayer(workspaceId, últimoMensaje)` (`src/lib/workspace-knowledge/context.ts`) arma el nivel 1; `buildInstructions` (`lib/agents/guardrails.ts`) ordena las capas. `RunAgentResult.context` expone `workspaceSourceIds` y `workspaceChunks` (id, fuente, tipo, título; nunca el texto) para auditoría.

Los fragmentos recuperados van dentro de un bloque marcado como **no confiable**: un PDF o una página pueden contener texto del tipo "ignora tus reglas". El smoke verifica que ese texto queda dentro del bloque, después del nivel 1 y antes del nivel 2.

## Modelo de datos

Migración `20261002233000_workspace_knowledge_base` (atómica, con `BEGIN/COMMIT`).

- `WorkspaceProfile` + `trade_name`, `location`, `payment_methods`, `service_channels`, `global_faqs` (JSONB, máx. 30), `brand_tone`, `escalation_rules`, `contact_info`, `general_instructions`.
- `KnowledgeSource.type` pasa de texto libre a enum `KnowledgeSourceType` (`TEXT`, `FAQ`, `POLICY` legacy + `MANUAL`, `URL`, `PDF`, `TEXT_FILE`). Se agregan `url`, `storage_key`, `original_name`, `mime_type`, `size_bytes`, `status` (`PENDING/PROCESSING/READY/FAILED`), `processing_error`, `metadata`, `ingested_at`, y `@@unique([id, workspaceId])`.
- `KnowledgeChunk`: fragmento de ~1.200 caracteres con 160 de solapamiento. FK compuesta `(source_id, workspace_id)`: un fragmento no puede apuntar a una fuente de otro workspace aunque falle la validación de la app. `search_vector` es una columna `tsvector` **generada** (título + contenido, config `simple`) con índice GIN; Prisma la ve como `Unsupported` y no la escribe.

**Dos detalles de la migración que importan en producción:**

1. `c2_knowledge` (ya aplicada en prod) dejó un `CHECK (type IN ('TEXT','FAQ','POLICY'))` sobre la columna `text`. Ese CHECK compara contra `text` y bloquea el `ALTER … TYPE` al enum; la migración lo elimina primero. Sin ese paso, el deploy falla.
2. **Backfill legacy:** las fuentes `TEXT/FAQ/POLICY` existentes reciben sus fragmentos en SQL, con las mismas ventanas que `chunkKnowledgeText`. Sin esto, tras migrar el agente dejaría de ver el conocimiento que ya tenía cada cliente.

Drift conocido de `prisma migrate diff`: el índice GIN, el `DEFAULT` de la columna generada y nada más. Ambos son limitaciones de Prisma con `Unsupported`, no diferencias reales.

## Ingesta

`src/lib/workspace-knowledge/service.ts` es la única puerta. Todo pasa por `requireManager` (OWNER/ADMIN vía `canManageWorkspaceSettings`) y toda escritura filtra por `workspaceId`.

| Tipo | Origen | Límite | Extracción |
|---|---|---|---|
| Texto | formulario | 120.000 caracteres | directa |
| Enlace | URL pública | 1 MB, 3 redirecciones, 8 s | HTML → texto (sin script/style/svg/iframe) |
| PDF | archivo | 4 MB, 100 páginas, 10 + 12 s | `unpdf` (solo texto; los escaneados fallan con motivo) |
| TXT / Markdown | archivo | 4 MB | UTF-8 estricto |

- El tope de 4 MB es porque el archivo viaja en el cuerpo de la request y Vercel corta en 4,5 MB.
- El archivo se valida por contenido, no por extensión: firma `%PDF`, sin firmas binarias conocidas, sin bytes NUL y UTF-8 válido. Un `.pdf` que no es PDF, o un ejecutable renombrado a `.txt`, se rechazan **sin crear** la fuente.
- La clave de storage es `knowledge/<workspaceId>/<uuid>.<ext>`, en el bucket privado `KNOWLEDGE_STORAGE_BUCKET` (distinto de `media` y de `deliverables`). La clave nunca sale del servidor.
- El procesamiento es síncrono (`maxDuration = 60`). Si falla al crear, la fuente queda `FAILED` con su motivo y la UI la muestra. Si falla un **reproceso**, se conserva la última versión válida (`READY` + fragmentos anteriores) y se guarda el error.
- Cada creación, cambio, activación, procesamiento, fallo y borrado escribe `AuditLog`, sin el contenido.

### SSRF

`ssrf.ts` bloquea esquemas distintos de http/https, credenciales en la URL, `localhost`/`*.localhost`, IPs privadas, loopback, link-local (incluido `169.254.169.254`), CGNAT, multicast, benchmarking, ULA/link-local IPv6 e IPv4 mapeadas. Si **cualquier** registro DNS es privado, se rechaza. Lo que no es una IP válida se bloquea (fail-closed).

La descarga usa `http/https` nativo con un `lookup` propio que vuelve a validar al conectar. La IP validada es la misma a la que se conecta, así que un DNS que cambia entre la validación y la conexión (DNS rebinding) no pasa. Cada redirección se valida de nuevo.

## Búsqueda

`retrieval.ts`:

1. Los términos de la pregunta pasan a minúscula, sin tildes y sin stopwords. Al tsquery solo llegan caracteres `[a-z0-9ñ]`: nada del lead entra como sintaxis.
2. Full-text con OR y un prefijo por término (`ubicacion` también busca `ubicaci:*`, que cubre "ubicación").
3. Si hay menos de 5 resultados, se completa con una pasada léxica sin tildes sobre los 200 fragmentos más recientes. Esto cubre "envio" ↔ "envío", que `simple` no pliega.
4. Se eliminan duplicados y se aplican los topes: 5 fragmentos y 6.000 caracteres.

Solo entran fuentes `isActive` y `READY` del mismo workspace (doble filtro, en `kc` y en `ks`). No hay embeddings ni servicios externos; si más adelante hacen falta, se cambia solo este archivo.

## Tools del agente

- `getBusinessInfo`: el perfil estructurado más la lista de fuentes activas (sin contenido).
- `searchKnowledge(query)`: fragmentos recuperados, marcados `trust: UNTRUSTED_REFERENCE_ONLY`. Con consulta vacía devuelve los fragmentos más recientes, con los mismos topes. Antes devolvía hasta 20 fuentes **completas**.

## UI — `IA · Conocimiento`

- **Perfil del negocio:** los 9 campos nuevos y un editor de FAQs generales, con SaveBar contextual y cambios sin guardar. Horario, "sobre el negocio" y políticas de venta/entrega/devolución **siguen editándose en Configuración**: si este formulario también los guardara, dos pantallas se pisarían. El schema es `strict` y rechaza esos campos.
- **Fuentes:** agregar texto, enlace o archivo; estado (lista / procesando / con error / inactiva); switch de disponibilidad; reprocesar (URL y archivos); ver el texto extraído; editar texto (reindexa); eliminar con confirmación. El listado trae solo un extracto de 280 caracteres, no el contenido completo.
- **Probar búsqueda** (`POST /api/knowledge/search`): muestra qué fragmentos recibiría el agente para una pregunta. No consume créditos de IA.
- MEMBER ve todo en solo lectura.

## Configuración pendiente (propietario)

- Crear el bucket privado `knowledge` en Supabase: 4 MB, `application/pdf`, `text/plain`, `text/markdown`.
- `KNOWLEDGE_STORAGE_BUCKET=knowledge` en Vercel (Production y Preview).

Sin la variable, la UI explica por qué no se pueden subir archivos; texto y enlaces funcionan igual.

Estado al 2026-11-02 (consulta de solo lectura a la API de Storage): existen `media` y `deliverables`; **`knowledge` no existe**. No se creó desde aquí porque ese proyecto de Supabase es el de producción.

**Validación real pendiente** (cuando exista el bucket): agregar `KNOWLEDGE_STORAGE_BUCKET=knowledge` a `apps/crm/.env.storage.local` y repetir, con el driver Supabase, el caso "archivo TXT/PDF se guarda, se indexa y se borra del storage". Hasta entonces, la subida y la búsqueda están validadas solo con el driver de disco local.

## Verificación

- `npm run test:workspace-knowledge` (22): fragmentado, archivos válidos/disfrazados/binarios/NUL/UTF-16/tamaño, schemas estrictos, SSRF (rangos, esquemas, credenciales, localhost, metadata, DNS mixto, rebinding, redirección a red interna, bucle, tipo, tamaño), saneo del tsquery, plegado de tildes, contexto estructurado, bloque no confiable, orden de capas.
- `npm run test:smoke:workspace-knowledge` (19, contra `crm_pruebas` con `.local-visual/studio.json`): RBAC, perfil sin pisar Configuración, READY, búsqueda sin tildes, aislamiento A/B en lectura/edición/borrado/reproceso, activar/desactivar, reindexado al editar, reproceso fallido que conserva la versión, topes, TXT en storage con borrado, PDF real con `unpdf`, archivo disfrazado, URL interna FAILED, inyección dentro del bloque no confiable, precedencia de la garantía del producto, "no tengo ese dato", tools acotadas, listado sin contenido ni `storageKey`, cascada de fragmentos.
- Regresiones: `test:product-sales-ai` (prueba de capas actualizada a los nuevos nombres), `test:smoke:product-sales-ai` 18/18, `test:foundation` 46/46, `test:smoke:all`, lint, TypeScript y build.
- QA visual en `crm-preview-visual` (:3101): guardar perfil y FAQ, recargar y ver que persisten; agregar una fuente de texto; buscar "hacen envios a regiones?" (sin tildes) y recuperarla; sin desborde horizontal ni vertical en 1025 y 375 px; sin errores de consola. El workspace B se mostró vacío mientras A tenía datos del smoke.
- Bug corregido en la QA: un `<span class="sm:sr-only">` (posición absoluta) dentro del contenedor con scroll alargaba el documento ~600 px. Los botones que lo contienen ahora llevan `relative`. **El mismo patrón está en `products/sales-brain-editor.tsx` (Punto 4) y no se tocó.**
- `c2-smoke` sigue fallando antes de las pruebas de conocimiento por `PLAN_FEATURE ai` con fixtures FREE. Es preexistente desde `8966835`; los fixtures C2 ahora crean sus fuentes con `createManualSource` para tener fragmentos.

## Deliberadamente fuera

Embeddings y vector search, crawler multipágina, refresco programado de URLs, OCR de PDFs escaneados, DOCX/XLSX, ingesta en cola, versionado de fuentes, conocimiento por canal o por automatización, citas visibles al cliente y analytics de uso del conocimiento.

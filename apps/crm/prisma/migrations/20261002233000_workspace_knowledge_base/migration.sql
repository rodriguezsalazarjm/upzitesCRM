-- Punto 5: workspace knowledge estructurado + sources/chunks recuperables.
-- Atómica: Prisma no envuelve el script; un fallo a mitad dejaría tipos y columnas sueltos.
BEGIN;

CREATE TYPE "KnowledgeSourceType" AS ENUM ('TEXT', 'FAQ', 'POLICY', 'MANUAL', 'URL', 'PDF', 'TEXT_FILE');
CREATE TYPE "KnowledgeProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "workspace_profiles"
  ADD COLUMN "trade_name" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "payment_methods" TEXT,
  ADD COLUMN "service_channels" TEXT,
  ADD COLUMN "global_faqs" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "brand_tone" TEXT,
  ADD COLUMN "escalation_rules" TEXT,
  ADD COLUMN "contact_info" TEXT,
  ADD COLUMN "general_instructions" TEXT;

-- c2_knowledge dejó un CHECK (type IN TEXT/FAQ/POLICY) sobre la columna text:
-- compara contra text y bloquea el cambio a enum. El enum lo reemplaza.
ALTER TABLE "knowledge_sources" DROP CONSTRAINT IF EXISTS "knowledge_sources_type_check";

ALTER TABLE "knowledge_sources"
  ALTER COLUMN "type" TYPE "KnowledgeSourceType" USING "type"::"KnowledgeSourceType",
  ALTER COLUMN "content" SET DEFAULT '',
  ADD COLUMN "url" TEXT,
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "original_name" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "size_bytes" INTEGER,
  ADD COLUMN "status" "KnowledgeProcessingStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "processing_error" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "ingested_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "knowledge_sources_id_workspace_id_key"
  ON "knowledge_sources"("id", "workspace_id");
CREATE INDEX "knowledge_sources_workspace_id_status_is_active_updated_at_idx"
  ON "knowledge_sources"("workspace_id", "status", "is_active", "updated_at");
CREATE INDEX "knowledge_sources_workspace_ready_idx"
  ON "knowledge_sources"("workspace_id", "updated_at" DESC)
  WHERE "is_active" = true AND "status" = 'READY';

CREATE TABLE "knowledge_chunks" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("metadata"->>'title', '') || ' ' || coalesce("content", ''))) STORED,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_chunks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_chunks_source_id_workspace_id_fkey" FOREIGN KEY ("source_id", "workspace_id") REFERENCES "knowledge_sources"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "knowledge_chunks_source_id_position_key"
  ON "knowledge_chunks"("source_id", "position");
CREATE INDEX "knowledge_chunks_workspace_id_source_id_idx"
  ON "knowledge_chunks"("workspace_id", "source_id");
CREATE INDEX "knowledge_chunks_search_vector_idx"
  ON "knowledge_chunks" USING GIN ("search_vector");

-- Backfill de fuentes legacy (TEXT/FAQ/POLICY): ya tenían contenido pero no
-- fragmentos. Ventanas de 1.200 caracteres con 160 de solapamiento, igual que
-- chunkKnowledgeText; el título viaja en metadata para entrar al índice.
INSERT INTO "knowledge_chunks" ("id", "workspace_id", "source_id", "position", "content", "metadata")
SELECT 'kcl' || md5(ks."id" || ':' || g.pos::text),
       ks."workspace_id",
       ks."id",
       g.pos,
       btrim(substring(ks."content" FROM g.pos * 1040 + 1 FOR 1200)),
       jsonb_build_object('title', ks."title", 'type', ks."type"::text, 'legacy', true)
  FROM "knowledge_sources" ks
  CROSS JOIN LATERAL generate_series(0, GREATEST(0, ceil(GREATEST(length(ks."content") - 160, 1)::numeric / 1040)::int - 1)) AS g(pos)
 WHERE ks."type" IN ('TEXT', 'FAQ', 'POLICY')
   AND btrim(substring(ks."content" FROM g.pos * 1040 + 1 FOR 1200)) <> '';

UPDATE "knowledge_sources"
   SET "ingested_at" = CURRENT_TIMESTAMP
 WHERE "type" IN ('TEXT', 'FAQ', 'POLICY') AND "ingested_at" IS NULL;

COMMIT;

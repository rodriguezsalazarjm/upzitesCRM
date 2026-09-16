CREATE TABLE "knowledge_sources" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('TEXT', 'FAQ', 'POLICY')),
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "knowledge_sources_workspace_id_type_is_active_idx" ON "knowledge_sources"("workspace_id", "type", "is_active");

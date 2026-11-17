-- Punto 22: Content Library. Tabla nueva + columna nullable en social_posts.
BEGIN;

CREATE TYPE "ContentAssetKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "content_assets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "ContentAssetKind" NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "collection" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_assets_storage_key_key" ON "content_assets"("storage_key");
CREATE INDEX "content_assets_workspace_id_created_at_idx" ON "content_assets"("workspace_id", "created_at");
CREATE INDEX "content_assets_workspace_id_collection_idx" ON "content_assets"("workspace_id", "collection");
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_posts" ADD COLUMN "content_asset_id" TEXT;
CREATE INDEX "social_posts_content_asset_id_idx" ON "social_posts"("content_asset_id");
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

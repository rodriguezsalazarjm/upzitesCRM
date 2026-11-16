-- Punto 19: Social Publisher. Tabla nueva + dos enums + un valor de JobType.
-- ADD VALUE va fuera de la transacción (el valor no se usa en esta migración).
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'PUBLISH_SOCIAL_POSTS';

BEGIN;

CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "SocialMediaType" AS ENUM ('IMAGE', 'REEL');

CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "network" "Channel" NOT NULL,
    "channel_account_id" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_url" TEXT,
    "media_type" "SocialMediaType" NOT NULL DEFAULT 'IMAGE',
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "container_id" TEXT,
    "external_post_id" TEXT,
    "permalink" TEXT,
    "published_at" TIMESTAMP(3),
    "last_error" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_posts_workspace_id_created_at_idx" ON "social_posts"("workspace_id", "created_at");
CREATE INDEX "social_posts_status_next_attempt_at_idx" ON "social_posts"("status", "next_attempt_at");

ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

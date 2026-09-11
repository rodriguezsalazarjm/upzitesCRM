-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'MAINTENANCE';

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "workspace_id" TEXT,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_flags_key_enabled_idx" ON "feature_flags"("key", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_scope_key_key" ON "feature_flags"("scope", "key");

-- CreateIndex
CREATE INDEX "rate_limit_windows_window_start_idx" ON "rate_limit_windows"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_windows_bucket_window_start_key" ON "rate_limit_windows"("bucket", "window_start");

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


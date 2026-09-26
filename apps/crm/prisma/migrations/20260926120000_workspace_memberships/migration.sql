-- P0-FOUNDATION step 1: usuario global, memberships y rol de plataforma.
-- Puramente aditiva: users.workspace_id, users.role, "UserRole" y platform_admins
-- se conservan como legacy (el codigo anterior sigue funcionando sobre este schema).

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SupportAccessMode" AS ENUM ('READ_ONLY', 'READ_WRITE');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active_workspace_id" TEXT,
ADD COLUMN     "platform_role" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invited_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "SupportAccessMode" NOT NULL DEFAULT 'READ_ONLY',
    "reason" TEXT NOT NULL,
    "elevated_at" TIMESTAMP(3),
    "elevated_reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_workspace_id" TEXT,
    "target_user_id" TEXT,
    "support_session_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_memberships_workspace_id_status_role_idx" ON "workspace_memberships"("workspace_id", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_user_id_workspace_id_key" ON "workspace_memberships"("user_id", "workspace_id");

-- CreateIndex
CREATE INDEX "support_sessions_workspace_id_started_at_idx" ON "support_sessions"("workspace_id", "started_at");

-- CreateIndex
CREATE INDEX "support_sessions_actor_user_id_ended_at_idx" ON "support_sessions"("actor_user_id", "ended_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_actor_user_id_created_at_idx" ON "platform_audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_target_workspace_id_created_at_idx" ON "platform_audit_logs"("target_workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_support_session_id_idx" ON "platform_audit_logs"("support_session_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_last_active_workspace_id_fkey" FOREIGN KEY ("last_active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill. Idempotente: ids deterministas + ON CONFLICT, y los UPDATE solo
-- tocan filas que aun no tienen el valor. Correrlo dos veces no duplica nada.
-- ---------------------------------------------------------------------------

-- 1. Exactamente una membership por usuario existente, en su workspace de origen.
INSERT INTO "workspace_memberships" ("id", "user_id", "workspace_id", "role", "status", "created_at", "updated_at")
SELECT
  'wm_' || u."id",
  u."id",
  u."workspace_id",
  CASE u."role"
    WHEN 'OWNER' THEN 'OWNER'::"WorkspaceRole"
    WHEN 'ADMIN' THEN 'ADMIN'::"WorkspaceRole"
    ELSE 'MEMBER'::"WorkspaceRole"
  END,
  'ACTIVE'::"MembershipStatus",
  u."created_at",
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("user_id", "workspace_id") DO NOTHING;

-- 2. El workspace de entrada al iniciar sesion es, de momento, el de origen.
UPDATE "users"
SET "last_active_workspace_id" = "workspace_id"
WHERE "last_active_workspace_id" IS NULL;

-- 3. Operadores de P0-A (tabla platform_admins) pasan a SUPER_ADMIN. Solo se
--    eleva a quien sigue en USER: nunca se rebaja un rol ya asignado.
UPDATE "users" u
SET "platform_role" = 'SUPER_ADMIN'::"PlatformRole"
FROM "platform_admins" pa
WHERE pa."user_id" = u."id"
  AND u."platform_role" = 'USER'::"PlatformRole";

INSERT INTO "platform_audit_logs" ("id", "actor_user_id", "action", "target_user_id", "metadata", "created_at")
SELECT
  'pal_migr_' || pa."user_id",
  NULL,
  'platform_role.migrated_from_platform_admins',
  pa."user_id",
  jsonb_build_object('role', 'SUPER_ADMIN', 'note', pa."note", 'grantedAt', pa."created_at"),
  CURRENT_TIMESTAMP
FROM "platform_admins" pa
ON CONFLICT ("id") DO NOTHING;

-- P0-FOUNDATION step 2 + P0-D invitaciones. Backward-compatible.
-- Pre-flight de produccion: 0 emails duplicados, 0 sin normalizar.

-- Guard: aborta (sin tocar nada, la migracion es transaccional) si hay emails
-- sin normalizar o duplicados. Hay que resolverlos a mano antes de migrar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "email" <> lower(btrim("email"))) THEN
    RAISE EXCEPTION 'step2: hay emails sin normalizar en users';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower(btrim("email")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'step2: hay emails duplicados en users';
  END IF;
END $$;

-- Email unico GLOBAL (una persona = una cuenta).
DROP INDEX IF EXISTS "users_workspace_id_email_key";
DROP INDEX IF EXISTS "users_email_idx";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- workspace_id pasa a legacy nullable; borrar el workspace de origen ya no
-- borra la cuenta global.
ALTER TABLE "users" ALTER COLUMN "workspace_id" DROP NOT NULL;
ALTER TABLE "users" DROP CONSTRAINT "users_workspace_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitaciones: solo el hash del token.
CREATE TABLE "workspace_invitations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_invitations_token_hash_key" ON "workspace_invitations"("token_hash");
CREATE INDEX "workspace_invitations_workspace_id_email_idx" ON "workspace_invitations"("workspace_id", "email");
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

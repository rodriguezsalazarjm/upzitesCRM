-- P0-E: Adaptive Workspace. Aditiva: no borra ni renombra nada.
--  - BusinessType gana APPOINTMENTS y GENERAL. INFOPRODUCT queda como valor
--    LEGACY (no se elimina del enum: seria destructivo) y sus filas pasan a
--    ECOMMERCE + commerce_subtype INFOPRODUCT, conservando el resto del perfil.
--  - Perfil: subtipo, objetivo, equipo, canales, preset y onboarding.
--  - workspace_user_preferences: personalizacion por USUARIO x WORKSPACE.
--  - preset_key queda NULL: la app lo deduce del businessType (GENERAL por
--    defecto). No se aplica ninguna personalizacion durante la migracion.

-- CreateEnum
CREATE TYPE "CommerceSubtype" AS ENUM ('INFOPRODUCT', 'PHYSICAL_PRODUCTS', 'MIXED', 'GENERAL_COMMERCE');

-- CreateEnum
CREATE TYPE "PrimaryGoal" AS ENUM ('LEADS', 'SALES', 'CONVERSATIONS', 'AUTOMATION', 'RECOVERY', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "TeamSize" AS ENUM ('SOLO', 'SMALL', 'MEDIUM', 'LARGE');

-- AlterEnum


ALTER TYPE "BusinessType" ADD VALUE 'APPOINTMENTS';
ALTER TYPE "BusinessType" ADD VALUE 'GENERAL';

-- AlterTable
ALTER TABLE "workspace_profiles" ADD COLUMN     "commerce_subtype" "CommerceSubtype",
ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "onboarding_completed_by" TEXT,
ADD COLUMN     "preferred_channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preset_key" TEXT,
ADD COLUMN     "preset_version" INTEGER,
ADD COLUMN     "primary_goal" "PrimaryGoal",
ADD COLUMN     "team_size" "TeamSize";

-- CreateTable
CREATE TABLE "workspace_user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sidebar_width" INTEGER,
    "sidebar_collapsed" BOOLEAN NOT NULL DEFAULT false,
    "nav_order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden_nav_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dashboard_layout" JSONB,
    "dismissed_tutorials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboarding_checklist_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_user_preferences_workspace_id_idx" ON "workspace_user_preferences"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_user_preferences_user_id_workspace_id_key" ON "workspace_user_preferences"("user_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_user_preferences" ADD CONSTRAINT "workspace_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user_preferences" ADD CONSTRAINT "workspace_user_preferences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Datos: INFOPRODUCT legacy -> ECOMMERCE + INFOPRODUCT (sin tocar otras columnas).
UPDATE "workspace_profiles"
SET "business_type" = 'ECOMMERCE', "commerce_subtype" = 'INFOPRODUCT'
WHERE "business_type" = 'INFOPRODUCT';

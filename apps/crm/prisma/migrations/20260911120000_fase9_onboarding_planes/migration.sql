-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('UNDEFINED', 'INFOPRODUCT', 'ECOMMERCE', 'SERVICES');

-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('INTEGRATION_DOWN', 'ALLOWANCE_NEAR_LIMIT', 'ALLOWANCE_EXCEEDED', 'SUBSCRIPTION_EXPIRED', 'ONBOARDING_INCOMPLETE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "allowances" JSONB,
ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "overages" JSONB,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "workspace_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_type" "BusinessType" NOT NULL DEFAULT 'UNDEFINED',
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "country" TEXT NOT NULL DEFAULT 'CL',
    "business_start_minute" INTEGER NOT NULL DEFAULT 540,
    "business_end_minute" INTEGER NOT NULL DEFAULT 1080,
    "business_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "about" TEXT,
    "policies" TEXT,
    "shipping_info" TEXT,
    "returns_policy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_activations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "ActivationStatus" NOT NULL DEFAULT 'ONBOARDING',
    "activated_at" TIMESTAMP(3),
    "activated_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "cost_clp" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_alerts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_profiles_workspace_id_key" ON "workspace_profiles"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_activations_workspace_id_key" ON "workspace_activations"("workspace_id");

-- CreateIndex
CREATE INDEX "usage_counters_workspace_id_period_idx" ON "usage_counters"("workspace_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_workspace_id_period_metric_key" ON "usage_counters"("workspace_id", "period", "metric");

-- CreateIndex
CREATE INDEX "workspace_alerts_workspace_id_resolved_at_idx" ON "workspace_alerts"("workspace_id", "resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_alerts_workspace_id_dedupe_key_key" ON "workspace_alerts"("workspace_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "workspace_profiles" ADD CONSTRAINT "workspace_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_activations" ADD CONSTRAINT "workspace_activations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_alerts" ADD CONSTRAINT "workspace_alerts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill de la Fase 9 -------------------------------------------------------
--
-- 1. Perfil comercial para los workspaces que ya existen, con los valores por
--    defecto. `business_type` queda UNDEFINED: no se puede adivinar como vende
--    un cliente, y fingir que se sabe seria peor que preguntarlo.
INSERT INTO "workspace_profiles" ("id", "workspace_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, w."id", now(), now()
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_profiles" p WHERE p."workspace_id" = w."id"
);

-- 2. Los workspaces anteriores a esta fase quedan ACTIVE, no en ONBOARDING.
--    Son clientes que ya estan operando: mandarlos al wizard apagaria un CRM
--    que funciona para satisfacer una tabla de contabilidad recien creada.
INSERT INTO "workspace_activations" ("id", "workspace_id", "status", "activated_at", "note", "created_at", "updated_at")
SELECT gen_random_uuid()::text, w."id", 'ACTIVE', now(),
       'Activado por migracion: el workspace es anterior al onboarding guiado.', now(), now()
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_activations" a WHERE a."workspace_id" = w."id"
);

-- 3. El plan mensual existente recibe sus capacidades y cupos. Hasta ahora el
--    plan no declaraba limites; sin esto, el primer control de consumo dejaria
--    fuera a todos los clientes actuales.
UPDATE "subscription_plans"
SET "capabilities" = ARRAY['WHATSAPP', 'AI_AGENTS', 'QUOTES', 'EMAIL', 'CAMPAIGNS', 'SHOPIFY', 'PAYMENTS'],
    "allowances" = '{"contacts":1000,"users":3,"whatsapp_numbers":1,"conversations":500,"ai_cost_clp":20000,"emails":2000,"campaign_contacts":1000}'::jsonb
WHERE "key" = 'monthly' AND "allowances" IS NULL;

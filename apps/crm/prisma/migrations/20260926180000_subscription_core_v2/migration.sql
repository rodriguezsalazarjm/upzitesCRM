-- P0-B: Subscription Core V2. Aditiva: status, trial_ends_at, renews_at,
-- mp_preference_id, mp_payment_id y las filas de planes legacy se conservan.
-- workspace_subscriptions.workspace_id pasa a UNIQUE: si hubiera duplicados la
-- migracion falla entera sin cambiar nada (pre-flight y crm_pruebas: 0).

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'START', 'PRO', 'SCALE');

-- CreateEnum
CREATE TYPE "BillingSource" AS ENUM ('FREE', 'MANUAL', 'MERCADO_PAGO', 'COMP', 'TRIAL');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "code" "PlanCode";

-- AlterTable
ALTER TABLE "workspace_subscriptions" ADD COLUMN     "amount_minor" INTEGER,
ADD COLUMN     "billing_source" "BillingSource" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "current_period_start" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "price_id" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspended_reason" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" TEXT NOT NULL,
    "plan_code" "PlanCode" NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
    "amount_minor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "plan_code" "PlanCode",
    "plan_key" TEXT NOT NULL,
    "source" "BillingSource" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "external_payment_id" TEXT,
    "price_id" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_prices_plan_code_currency_interval_active_idx" ON "plan_prices"("plan_code", "currency", "interval", "active");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_external_payment_id_key" ON "subscription_payments"("external_payment_id");

-- CreateIndex
CREATE INDEX "subscription_payments_workspace_id_paid_at_idx" ON "subscription_payments"("workspace_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_subscriptions_workspace_id_key" ON "workspace_subscriptions"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "workspace_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill idempotente de suscripciones legacy (plan sin code).
-- ---------------------------------------------------------------------------

-- 1. Medio de pago, deducido del estado legacy. Nunca se deduce el PLAN.
UPDATE "workspace_subscriptions" s
SET "billing_source" = CASE
    WHEN s."mp_payment_id" IS NOT NULL THEN 'MERCADO_PAGO'::"BillingSource"
    WHEN s."status" = 'TRIAL' THEN 'TRIAL'::"BillingSource"
    ELSE 'MANUAL'::"BillingSource"
  END
FROM "subscription_plans" p
WHERE p."id" = s."plan_id"
  AND p."code" IS NULL
  AND s."billing_source" = 'FREE';

-- 2. Periodo vigente desde las fechas legacy.
UPDATE "workspace_subscriptions"
SET "current_period_start" = COALESCE("current_period_start", "created_at"),
    "current_period_end" = COALESCE("current_period_end", "renews_at", "trial_ends_at")
WHERE "current_period_start" IS NULL OR "current_period_end" IS NULL;

-- 3. El pago de Mercado Pago ya confirmado pasa al libro SaaS, para no perder
--    el historial (antes solo quedaba mp_payment_id en la misma fila).
INSERT INTO "subscription_payments" (
  "id", "workspace_id", "subscription_id", "plan_code", "plan_key", "source", "currency",
  "amount_minor", "paid_at", "period_start", "period_end", "external_payment_id", "notes", "created_at"
)
SELECT
  'sp_legacy_' || s."id", s."workspace_id", s."id", p."code", p."key", 'MERCADO_PAGO'::"BillingSource", 'CLP',
  p."price_clp", s."updated_at", s."renews_at" - INTERVAL '30 days', s."renews_at", s."mp_payment_id",
  'Migrado desde workspace_subscriptions (P0-B)', CURRENT_TIMESTAMP
FROM "workspace_subscriptions" s
JOIN "subscription_plans" p ON p."id" = s."plan_id"
WHERE s."mp_payment_id" IS NOT NULL AND s."renews_at" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Los planes legacy ya no se venden (sus suscripciones siguen resolviendose).
UPDATE "subscription_plans" SET "is_active" = false WHERE "code" IS NULL AND "is_active" = true;

-- ---------------------------------------------------------------------------
-- Price Book inicial (MONTH). Unidades menores ISO 4217: CLP exp. 0, USD exp. 2.
-- Ids deterministas: re-ejecutar no duplica. Cambios futuros = filas nuevas.
-- ---------------------------------------------------------------------------
INSERT INTO "plan_prices" ("id", "plan_code", "currency", "interval", "amount_minor", "active", "valid_from")
VALUES
  ('price_free_clp_month_v1',  'FREE',  'CLP', 'MONTH', 0,     true, CURRENT_TIMESTAMP),
  ('price_start_clp_month_v1', 'START', 'CLP', 'MONTH', 19990, true, CURRENT_TIMESTAMP),
  ('price_pro_clp_month_v1',   'PRO',   'CLP', 'MONTH', 49990, true, CURRENT_TIMESTAMP),
  ('price_scale_clp_month_v1', 'SCALE', 'CLP', 'MONTH', 99990, true, CURRENT_TIMESTAMP),
  ('price_free_usd_month_v1',  'FREE',  'USD', 'MONTH', 0,     true, CURRENT_TIMESTAMP),
  ('price_start_usd_month_v1', 'START', 'USD', 'MONTH', 1900,  true, CURRENT_TIMESTAMP),
  ('price_pro_usd_month_v1',   'PRO',   'USD', 'MONTH', 4900,  true, CURRENT_TIMESTAMP),
  ('price_scale_usd_month_v1', 'SCALE', 'USD', 'MONTH', 9900,  true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

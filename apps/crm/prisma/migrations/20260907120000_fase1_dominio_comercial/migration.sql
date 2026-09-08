-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('LEAD', 'QUALIFIED', 'CUSTOMER', 'REPEAT_CUSTOMER', 'LOST');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "BuyingIntent" AS ENUM ('UNKNOWN', 'INTERESTED', 'QUOTE_REQUESTED', 'CHECKOUT_STARTED', 'NO_INTENT');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('AI_ACTIVE', 'HUMAN_ACTIVE', 'WAITING', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PENDING_HUMAN_REVIEW', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('UNKNOWN', 'GRANTED', 'REVOKED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'ADS');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('USER_REQUEST', 'HARD_BOUNCE', 'SPAM_COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScheduledActionType" AS ENUM ('FOLLOW_UP', 'CHECKOUT_RECOVERY', 'QUOTE_REMINDER', 'REPURCHASE_REMINDER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'CANCELED', 'FAILED');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "buying_intent" "BuyingIntent" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "lead_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifecycle_status" "LifecycleStatus" NOT NULL DEFAULT 'LEAD',
ADD COLUMN     "score_updated_at" TIMESTAMP(3),
ADD COLUMN     "temperature" "LeadTemperature" NOT NULL DEFAULT 'COLD';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;

-- CreateTable
CREATE TABLE "contact_channel_consents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "evidence" JSONB,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_channel_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_entries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "identifier" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL DEFAULT 'USER_REQUEST',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_score_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_score_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "temperature" "LeadTemperature" NOT NULL,
    "reasons" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_actions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "type" "ScheduledActionType" NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "cancel_key" TEXT,
    "run_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_estimate" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "reference_type" TEXT,
    "reference_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_channel_consents_workspace_id_channel_status_idx" ON "contact_channel_consents"("workspace_id", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channel_consents_contact_id_channel_key" ON "contact_channel_consents"("contact_id", "channel");

-- CreateIndex
CREATE INDEX "suppression_entries_workspace_id_channel_idx" ON "suppression_entries"("workspace_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_entries_workspace_id_channel_identifier_key" ON "suppression_entries"("workspace_id", "channel", "identifier");

-- CreateIndex
CREATE INDEX "lead_score_rules_workspace_id_is_active_idx" ON "lead_score_rules"("workspace_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lead_score_rules_workspace_id_key_key" ON "lead_score_rules"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "lead_score_snapshots_workspace_id_contact_id_created_at_idx" ON "lead_score_snapshots"("workspace_id", "contact_id", "created_at");

-- CreateIndex
CREATE INDEX "scheduled_actions_status_run_at_idx" ON "scheduled_actions"("status", "run_at");

-- CreateIndex
CREATE INDEX "scheduled_actions_workspace_id_cancel_key_idx" ON "scheduled_actions"("workspace_id", "cancel_key");

-- CreateIndex
CREATE INDEX "scheduled_actions_workspace_id_contact_id_idx" ON "scheduled_actions"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "usage_records_workspace_id_metric_occurred_at_idx" ON "usage_records"("workspace_id", "metric", "occurred_at");

-- CreateIndex
CREATE INDEX "usage_records_workspace_id_provider_idx" ON "usage_records"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_lifecycle_status_idx" ON "contacts"("workspace_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_temperature_idx" ON "contacts"("workspace_id", "temperature");

-- AddForeignKey
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_rules" ADD CONSTRAINT "lead_score_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_snapshots" ADD CONSTRAINT "lead_score_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_snapshots" ADD CONSTRAINT "lead_score_snapshots_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: derivar el ciclo de vida desde el `status` existente.
-- `status` (ContactStatus) NO se elimina: la UI y las rutas actuales siguen
-- leyendolo. Se retira en una migracion posterior, una vez que todo consuma
-- `lifecycle_status`.
UPDATE "contacts" SET "lifecycle_status" = CASE "status"
  WHEN 'LEAD'     THEN 'LEAD'::"LifecycleStatus"
  WHEN 'ACTIVE'   THEN 'QUALIFIED'::"LifecycleStatus"
  WHEN 'CUSTOMER' THEN 'CUSTOMER'::"LifecycleStatus"
  WHEN 'INACTIVE' THEN 'LOST'::"LifecycleStatus"
  ELSE 'LEAD'::"LifecycleStatus"
END;

-- Los contactos que ya son clientes no pueden quedar como COLD por defecto.
UPDATE "contacts" SET "temperature" = 'WARM'::"LeadTemperature"
WHERE "lifecycle_status" IN ('CUSTOMER'::"LifecycleStatus", 'REPEAT_CUSTOMER'::"LifecycleStatus");

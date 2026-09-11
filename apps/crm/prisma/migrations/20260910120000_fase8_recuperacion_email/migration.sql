-- CreateEnum
CREATE TYPE "SegmentSource" AS ENUM ('PRESET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JourneyTrigger" AS ENUM ('NO_ACTIVITY', 'CHECKOUT_ABANDONED', 'QUOTE_PENDING', 'ORDER_PAID', 'MANUAL');

-- CreateEnum
CREATE TYPE "JourneyStepAction" AS ENUM ('SEND_WHATSAPP', 'SEND_EMAIL', 'CREATE_TASK', 'SET_TEMPERATURE', 'EXIT');

-- CreateEnum
CREATE TYPE "JourneyEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailProviderKind" AS ENUM ('SCRIPTED', 'RESEND');

-- CreateEnum
CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'FAILED');

-- CreateEnum
CREATE TYPE "SendCategory" AS ENUM ('PROMOTIONAL', 'OPERATIONAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'EMAIL_OPENED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'EMAIL_CLICKED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'EMAIL_BOUNCED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SEND_EMAIL';
ALTER TYPE "JobType" ADD VALUE 'SEND_CAMPAIGN';
ALTER TYPE "JobType" ADD VALUE 'PROCESS_JOURNEYS';
ALTER TYPE "JobType" ADD VALUE 'RUN_JOURNEY_STEP';
ALTER TYPE "JobType" ADD VALUE 'SCAN_JOURNEY_ENTRIES';
ALTER TYPE "JobType" ADD VALUE 'REFRESH_SEGMENT_COUNTS';

-- CreateTable
CREATE TABLE "messaging_policies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "quiet_start_minute" INTEGER NOT NULL DEFAULT 1230,
    "quiet_end_minute" INTEGER NOT NULL DEFAULT 540,
    "max_whatsapp_per_day" INTEGER NOT NULL DEFAULT 1,
    "max_email_per_week" INTEGER NOT NULL DEFAULT 3,
    "max_consecutive_no_reply" INTEGER NOT NULL DEFAULT 3,
    "allow_same_day_multichannel" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "SegmentSource" NOT NULL DEFAULT 'PRESET',
    "definition" JSONB NOT NULL,
    "estimated_count" INTEGER NOT NULL DEFAULT 0,
    "last_evaluated_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journeys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "JourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" "JourneyTrigger" NOT NULL,
    "segment_id" TEXT,
    "entry_conditions" JSONB,
    "exit_conditions" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_steps" (
    "id" TEXT NOT NULL,
    "journey_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "action" "JourneyStepAction" NOT NULL,
    "delay_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channel" "ConsentChannel",
    "template_id" TEXT,
    "body" TEXT,
    "conditions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_enrollments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "journey_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "JourneyEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_position" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3),
    "cancel_key" TEXT NOT NULL,
    "steps_completed" INTEGER NOT NULL DEFAULT 0,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" TIMESTAMP(3),
    "exit_reason" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_domains" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider" "EmailProviderKind" NOT NULL DEFAULT 'SCRIPTED',
    "status" "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
    "dns_records" JSONB,
    "provider_domain_id" TEXT,
    "from_name" TEXT,
    "from_email" TEXT,
    "verified_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_slots" JSONB,
    "category" "SendCategory" NOT NULL DEFAULT 'PROMOTIONAL',
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL DEFAULT 'EMAIL',
    "segment_id" TEXT,
    "template_id" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "bounced_count" INTEGER NOT NULL DEFAULT 0,
    "complained_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skip_reason" TEXT,
    "email_message_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "campaign_id" TEXT,
    "journey_id" TEXT,
    "template_id" TEXT,
    "to_email" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "category" "SendCategory" NOT NULL DEFAULT 'PROMOTIONAL',
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" "EmailProviderKind" NOT NULL DEFAULT 'SCRIPTED',
    "provider_message_id" TEXT,
    "unsubscribe_token_hash" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "complained_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email_message_id" TEXT,
    "type" "EmailEventType" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_send_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "category" "SendCategory" NOT NULL DEFAULT 'PROMOTIONAL',
    "journey_id" TEXT,
    "campaign_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_policies_workspace_id_key" ON "messaging_policies"("workspace_id");

-- CreateIndex
CREATE INDEX "segments_workspace_id_is_active_idx" ON "segments"("workspace_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "segments_workspace_id_key_key" ON "segments"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "journeys_workspace_id_status_idx" ON "journeys"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "journeys_workspace_id_key_key" ON "journeys"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "journey_steps_journey_id_position_key" ON "journey_steps"("journey_id", "position");

-- CreateIndex
CREATE INDEX "journey_enrollments_workspace_id_status_idx" ON "journey_enrollments"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "journey_enrollments_status_next_run_at_idx" ON "journey_enrollments"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "journey_enrollments_journey_id_contact_id_key" ON "journey_enrollments"("journey_id", "contact_id");

-- CreateIndex
CREATE INDEX "email_domains_workspace_id_status_idx" ON "email_domains"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_domains_workspace_id_domain_key" ON "email_domains"("workspace_id", "domain");

-- CreateIndex
CREATE INDEX "email_templates_workspace_id_status_idx" ON "email_templates"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_workspace_id_key_key" ON "email_templates"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_status_idx" ON "campaigns"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_email_message_id_key" ON "campaign_recipients"("email_message_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_workspace_id_status_idx" ON "campaign_recipients"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_contact_id_key" ON "campaign_recipients"("campaign_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_unsubscribe_token_hash_key" ON "email_messages"("unsubscribe_token_hash");

-- CreateIndex
CREATE INDEX "email_messages_workspace_id_status_idx" ON "email_messages"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "email_messages_workspace_id_contact_id_idx" ON "email_messages"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "email_messages_workspace_id_provider_message_id_idx" ON "email_messages"("workspace_id", "provider_message_id");

-- CreateIndex
CREATE INDEX "email_events_workspace_id_type_occurred_at_idx" ON "email_events"("workspace_id", "type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_workspace_id_dedupe_key_key" ON "email_events"("workspace_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "contact_send_logs_workspace_id_contact_id_channel_sent_at_idx" ON "contact_send_logs"("workspace_id", "contact_id", "channel", "sent_at");

-- CreateIndex
CREATE INDEX "contact_send_logs_workspace_id_sent_at_idx" ON "contact_send_logs"("workspace_id", "sent_at");

-- AddForeignKey
ALTER TABLE "messaging_policies" ADD CONSTRAINT "messaging_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_domains" ADD CONSTRAINT "email_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_send_logs" ADD CONSTRAINT "contact_send_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_send_logs" ADD CONSTRAINT "contact_send_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_send_logs" ADD CONSTRAINT "contact_send_logs_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_send_logs" ADD CONSTRAINT "contact_send_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill de la Fase 8 -------------------------------------------------------
--
-- 1. Politica de contacto para los workspaces que ya existen. Sin esto un
--    workspace anterior a esta fase quedaria sin quiet hours ni topes, es
--    decir, sin las protecciones que la fase introduce.
INSERT INTO "messaging_policies" ("id", "workspace_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, w."id", now(), now()
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "messaging_policies" mp WHERE mp."workspace_id" = w."id"
);

-- 2. Las dos reglas de scoring que la Fase 1 dejo inactivas porque el canal de
--    email no existia. Ahora si son calculables (spec, seccion 10).
--    Solo se agregan a workspaces que ya tienen reglas: uno sin reglas usa las
--    de fabrica, que ya las incluyen.
INSERT INTO "lead_score_rules" ("id", "workspace_id", "key", "label", "points", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, r."workspace_id", v."key", v."label", v."points", true, now(), now()
FROM (SELECT DISTINCT "workspace_id" FROM "lead_score_rules") r
CROSS JOIN (VALUES
  ('email_opened', 'Abrio un email', 5),
  ('email_clicked', 'Hizo clic en un email', 10)
) AS v("key", "label", "points")
WHERE NOT EXISTS (
  SELECT 1 FROM "lead_score_rules" e
  WHERE e."workspace_id" = r."workspace_id" AND e."key" = v."key"
);

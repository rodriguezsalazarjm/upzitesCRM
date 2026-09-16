-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ChannelConnectionMethod" AS ENUM ('OAUTH', 'MANUAL');

-- CreateEnum
CREATE TYPE "ChannelAccountStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'NEEDS_ATTENTION', 'REAUTH_REQUIRED');

-- CreateEnum
CREATE TYPE "ChannelEventType" AS ENUM ('DM_RECEIVED', 'COMMENT', 'STORY_REPLY', 'STORY_MENTION', 'LIVE_COMMENT', 'FOLLOW', 'SHARE', 'AD_CONVERSATION_STARTED', 'REF_LINK', 'QR_SCAN');

-- CreateEnum
CREATE TYPE "ChannelEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AutomationFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationFlowRunStatus" AS ENUM ('RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'INSTAGRAM';
ALTER TYPE "IntegrationProvider" ADD VALUE 'MESSENGER';
ALTER TYPE "IntegrationProvider" ADD VALUE 'TIKTOK';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channel_account_id" TEXT,
ADD COLUMN     "channel_type" "Channel" NOT NULL DEFAULT 'WHATSAPP',
ALTER COLUMN "channel_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "connection_method" "ChannelConnectionMethod" NOT NULL DEFAULT 'MANUAL',
    "external_account_id" TEXT NOT NULL,
    "display_name" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ChannelAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connected_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_channel_identities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_channel_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "type" "ChannelEventType" NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "conversation_id" TEXT,
    "content" JSONB,
    "raw_metadata" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "status" "ChannelEventStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_flows" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "channel_scope" "Channel"[] DEFAULT ARRAY[]::"Channel"[],
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_flow_versions" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AutomationFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "runs_started" INTEGER NOT NULL DEFAULT 0,
    "runs_completed" INTEGER NOT NULL DEFAULT 0,
    "runs_failed" INTEGER NOT NULL DEFAULT 0,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "checkouts_created" INTEGER NOT NULL DEFAULT 0,
    "payments_approved" INTEGER NOT NULL DEFAULT 0,
    "handoffs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_flow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_flow_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "flow_version_id" TEXT NOT NULL,
    "channel" "Channel",
    "contact_id" TEXT,
    "conversation_id" TEXT,
    "trigger_dedupe_key" TEXT,
    "status" "AutomationFlowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "current_node_id" TEXT,
    "state" JSONB,
    "steps_executed" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waiting_until" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_flow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supported_channels" "Channel"[],
    "required_capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "required_fields" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_accounts_workspace_id_channel_idx" ON "channel_accounts"("workspace_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_channel_external_account_id_key" ON "channel_accounts"("channel", "external_account_id");

-- CreateIndex
CREATE INDEX "contact_channel_identities_workspace_id_contact_id_idx" ON "contact_channel_identities"("workspace_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channel_identities_channel_account_id_external_user_key" ON "contact_channel_identities"("channel_account_id", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_events_idempotency_key_key" ON "channel_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "channel_events_workspace_id_channel_created_at_idx" ON "channel_events"("workspace_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "channel_events_workspace_id_status_idx" ON "channel_events"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "automation_flows_workspace_id_status_idx" ON "automation_flows"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "automation_flow_versions_flow_id_status_idx" ON "automation_flow_versions"("flow_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_flow_versions_flow_id_version_key" ON "automation_flow_versions"("flow_id", "version");

-- CreateIndex
CREATE INDEX "automation_flow_runs_workspace_id_status_idx" ON "automation_flow_runs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "automation_flow_runs_flow_id_status_idx" ON "automation_flow_runs"("flow_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_flow_runs_flow_version_id_trigger_dedupe_key_key" ON "automation_flow_runs"("flow_version_id", "trigger_dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "automation_templates_key_key" ON "automation_templates"("key");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_channel_type_idx" ON "conversations"("workspace_id", "channel_type");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_account_id_contact_id_key" ON "conversations"("channel_account_id", "contact_id");

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channel_identities" ADD CONSTRAINT "contact_channel_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channel_identities" ADD CONSTRAINT "contact_channel_identities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channel_identities" ADD CONSTRAINT "contact_channel_identities_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flows" ADD CONSTRAINT "automation_flows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_versions" ADD CONSTRAINT "automation_flow_versions_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "automation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_runs" ADD CONSTRAINT "automation_flow_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_runs" ADD CONSTRAINT "automation_flow_runs_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "automation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_runs" ADD CONSTRAINT "automation_flow_runs_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "automation_flow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_runs" ADD CONSTRAINT "automation_flow_runs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flow_runs" ADD CONSTRAINT "automation_flow_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "WhatsAppChannelStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'SNOOZED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('CONTACT', 'USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'INTERACTIVE', 'TEMPLATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "OutboxType" AS ENUM ('WHATSAPP_MESSAGE', 'WHATSAPP_TEMPLATE', 'WHATSAPP_READ_RECEIPT');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_channels" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "integration_id" TEXT,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT NOT NULL,
    "business_name" TEXT,
    "access_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "status" "WhatsAppChannelStatus" NOT NULL DEFAULT 'PENDING',
    "quality_rating" TEXT,
    "messaging_limit" TEXT,
    "webhook_subscribed_at" TIMESTAMP(3),
    "last_health_check_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "assigned_user_id" TEXT,
    "mode" "ConversationMode" NOT NULL DEFAULT 'WAITING',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "current_agent_id" TEXT,
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_service_window_ends_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "external_message_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "senderType" "MessageSenderType" NOT NULL,
    "sender_user_id" TEXT,
    "agent_run_id" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "payload" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "error_code" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "type" "OutboxType" NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_phone_number_id_key" ON "whatsapp_channels"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_channels_workspace_id_status_idx" ON "whatsapp_channels"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_status_last_message_at_idx" ON "conversations"("workspace_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_assigned_user_id_idx" ON "conversations"("workspace_id", "assigned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_id_contact_id_key" ON "conversations"("channel_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_external_message_id_key" ON "messages"("external_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_workspace_id_status_idx" ON "messages"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "webhook_events_status_created_at_idx" ON "webhook_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_dedupe_key_key" ON "webhook_events"("provider", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "whatsapp_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


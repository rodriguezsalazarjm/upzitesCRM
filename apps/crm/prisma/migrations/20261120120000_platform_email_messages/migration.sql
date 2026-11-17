-- CreateEnum
CREATE TYPE "PlatformEmailKind" AS ENUM ('INVITATION', 'PASSWORD_RESET', 'SECURITY', 'TEST');

-- CreateTable
CREATE TABLE "platform_email_messages" (
    "id" TEXT NOT NULL,
    "kind" "PlatformEmailKind" NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'SENT',
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "complained_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_email_messages_provider_message_id_key" ON "platform_email_messages"("provider_message_id");

-- CreateIndex
CREATE INDEX "platform_email_messages_created_at_idx" ON "platform_email_messages"("created_at");


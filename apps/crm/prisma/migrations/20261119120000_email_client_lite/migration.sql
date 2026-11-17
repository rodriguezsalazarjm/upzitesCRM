-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('GMAIL', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('CONNECTED', 'ERROR', 'REVOKED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SYNC_MAILBOXES';

-- CreateTable
CREATE TABLE "mailbox_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "MailProvider" NOT NULL,
    "email_address" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "MailboxStatus" NOT NULL DEFAULT 'CONNECTED',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_threads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "provider_thread_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "in_inbox" BOOLEAN NOT NULL DEFAULT true,
    "has_sent" BOOLEAN NOT NULL DEFAULT false,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "contact_id" TEXT,
    "company_id" TEXT,
    "opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "internet_message_id" TEXT,
    "outbound" BOOLEAN NOT NULL DEFAULT false,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT NOT NULL DEFAULT '',
    "to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "sales_quote_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mailbox_accounts_status_last_synced_at_idx" ON "mailbox_accounts"("status", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_accounts_workspace_id_user_id_provider_email_addres_key" ON "mailbox_accounts"("workspace_id", "user_id", "provider", "email_address");

-- CreateIndex
CREATE INDEX "mail_threads_mailbox_id_last_message_at_idx" ON "mail_threads"("mailbox_id", "last_message_at");

-- CreateIndex
CREATE INDEX "mail_threads_workspace_id_contact_id_idx" ON "mail_threads"("workspace_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_threads_mailbox_id_provider_thread_id_key" ON "mail_threads"("mailbox_id", "provider_thread_id");

-- CreateIndex
CREATE INDEX "mail_messages_thread_id_sent_at_idx" ON "mail_messages"("thread_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_messages_mailbox_id_provider_message_id_key" ON "mail_messages"("mailbox_id", "provider_message_id");

-- AddForeignKey
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "mail_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


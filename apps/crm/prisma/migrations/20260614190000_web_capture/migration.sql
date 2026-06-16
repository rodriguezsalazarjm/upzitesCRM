-- CreateEnum
CREATE TYPE "WebEventType" AS ENUM ('PAGE_VIEW', 'CTA_CLICK', 'FORM_SUBMIT', 'WHATSAPP_CLICK');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "public_key" TEXT;

-- Backfill
UPDATE "workspaces" SET "public_key" = 'ws_' || md5("id") WHERE "public_key" IS NULL;

-- Enforce
ALTER TABLE "workspaces" ALTER COLUMN "public_key" SET NOT NULL;
CREATE UNIQUE INDEX "workspaces_public_key_key" ON "workspaces"("public_key");

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "submit_label" TEXT NOT NULL DEFAULT 'Enviar',
    "source" TEXT NOT NULL DEFAULT 'Formulario web',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "payload" JSONB NOT NULL,
    "page_url" TEXT,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" "WebEventType" NOT NULL,
    "page_url" TEXT NOT NULL,
    "referrer" TEXT,
    "element" TEXT,
    "form_id" TEXT,
    "contact_id" TEXT,
    "visitor_id" TEXT,
    "session_id" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forms_public_id_key" ON "forms"("public_id");

-- CreateIndex
CREATE INDEX "forms_workspace_id_idx" ON "forms"("workspace_id");

-- CreateIndex
CREATE INDEX "form_submissions_workspace_id_created_at_idx" ON "form_submissions"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "form_submissions_form_id_idx" ON "form_submissions"("form_id");

-- CreateIndex
CREATE INDEX "web_events_workspace_id_type_created_at_idx" ON "web_events"("workspace_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "web_events_workspace_id_page_url_idx" ON "web_events"("workspace_id", "page_url");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_events" ADD CONSTRAINT "web_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

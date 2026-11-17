-- P26: plantillas de WhatsApp y su uso en pasos de seguimiento.
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');
CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

ALTER TABLE "journey_steps" ADD COLUMN "whatsapp_template_id" TEXT;

CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "WhatsAppTemplateCategory" NOT NULL,
    "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejected_reason" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_templates_external_id_key" ON "whatsapp_templates"("external_id");
CREATE INDEX "whatsapp_templates_workspace_id_status_idx" ON "whatsapp_templates"("workspace_id", "status");
CREATE UNIQUE INDEX "whatsapp_templates_channel_id_name_language_key" ON "whatsapp_templates"("channel_id", "name", "language");

ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "whatsapp_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_whatsapp_template_id_fkey" FOREIGN KEY ("whatsapp_template_id") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

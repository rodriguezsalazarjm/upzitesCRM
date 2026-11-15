-- Punto 8: WhatsApp Channel Manager.
--
-- Configuracion por numero sobre la tabla existente (no se crea otro modelo de
-- canal): identidad, agente/producto/automatizacion por defecto, IA y horario
-- de atencion, fallback humano y observabilidad real (ultimo webhook, ultimo
-- entrante, ultimo error). Columnas nuevas con default: los canales existentes
-- quedan exactamente como estaban (IA activa siempre, sin defaults).
BEGIN;

-- CreateEnum
CREATE TYPE "WhatsAppChannelUsage" AS ENUM ('SALES', 'SUPPORT', 'GENERAL');

-- CreateEnum
CREATE TYPE "WhatsAppAiSchedule" AS ENUM ('ALWAYS', 'IN_HOURS', 'OUT_OF_HOURS');

-- CreateEnum
CREATE TYPE "WhatsAppNoProductBehavior" AS ENUM ('AI_GENERAL', 'HUMAN');

-- AlterTable
ALTER TABLE "whatsapp_channels" ADD COLUMN     "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ai_schedule" "WhatsAppAiSchedule" NOT NULL DEFAULT 'ALWAYS',
ADD COLUMN     "attention_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "attention_end_minute" INTEGER NOT NULL DEFAULT 1140,
ADD COLUMN     "attention_start_minute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "attention_timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
ADD COLUMN     "connection_method" TEXT,
ADD COLUMN     "default_agent_id" TEXT,
ADD COLUMN     "default_flow_id" TEXT,
ADD COLUMN     "default_product_id" TEXT,
ADD COLUMN     "fallback_user_id" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "last_error_at" TIMESTAMP(3),
ADD COLUMN     "last_error_code" TEXT,
ADD COLUMN     "last_error_message" TEXT,
ADD COLUMN     "last_inbound_at" TIMESTAMP(3),
ADD COLUMN     "last_webhook_at" TIMESTAMP(3),
ADD COLUMN     "no_product_behavior" "WhatsAppNoProductBehavior" NOT NULL DEFAULT 'AI_GENERAL',
ADD COLUMN     "usage" "WhatsAppChannelUsage" NOT NULL DEFAULT 'GENERAL';

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_default_agent_id_fkey" FOREIGN KEY ("default_agent_id") REFERENCES "agent_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_default_product_id_fkey" FOREIGN KEY ("default_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_default_flow_id_fkey" FOREIGN KEY ("default_flow_id") REFERENCES "automation_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_fallback_user_id_fkey" FOREIGN KEY ("fallback_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El horario se valida tambien en el servidor; la base es la ultima red.
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_attention_minutes_check"
  CHECK ("attention_start_minute" BETWEEN 0 AND 1439 AND "attention_end_minute" BETWEEN 0 AND 1439);

CREATE INDEX "whatsapp_channels_default_agent_id_idx" ON "whatsapp_channels"("default_agent_id");
CREATE INDEX "whatsapp_channels_default_product_id_idx" ON "whatsapp_channels"("default_product_id");
CREATE INDEX "whatsapp_channels_default_flow_id_idx" ON "whatsapp_channels"("default_flow_id");

COMMIT;

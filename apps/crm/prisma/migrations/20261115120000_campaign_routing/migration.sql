-- Punto 9: Campaign Routing. Reglas anuncio/conjunto/campaña -> producto,
-- agente y automatización; la conversación guarda la regla aplicada y el
-- referral de Meta. Solo columnas nuevas y nullable: nada existente cambia.
BEGIN;

-- CreateEnum
CREATE TYPE "CampaignRouteLevel" AS ENUM ('AD', 'ADSET', 'CAMPAIGN');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "attribution" JSONB,
ADD COLUMN     "campaign_route_id" TEXT;

-- CreateTable
CREATE TABLE "campaign_routes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "CampaignRouteLevel" NOT NULL,
    "external_id" TEXT NOT NULL,
    "product_id" TEXT,
    "agent_id" TEXT,
    "flow_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_routes_workspace_id_level_external_id_key" ON "campaign_routes"("workspace_id", "level", "external_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campaign_route_id_fkey" FOREIGN KEY ("campaign_route_id") REFERENCES "campaign_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_routes" ADD CONSTRAINT "campaign_routes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_routes" ADD CONSTRAINT "campaign_routes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_routes" ADD CONSTRAINT "campaign_routes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_routes" ADD CONSTRAINT "campaign_routes_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "automation_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;

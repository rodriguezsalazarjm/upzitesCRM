-- Punto 10: atribución CTWA. First touch en el contacto y snapshot de la
-- atribución en el pedido. Solo columnas nullable nuevas.
BEGIN;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "first_touch" JSONB;

-- AlterTable
ALTER TABLE "customer_orders" ADD COLUMN     "attribution" JSONB,
ADD COLUMN     "campaign_route_id" TEXT;

-- CreateIndex
CREATE INDEX "customer_orders_campaign_route_id_idx" ON "customer_orders"("campaign_route_id");

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_campaign_route_id_fkey" FOREIGN KEY ("campaign_route_id") REFERENCES "campaign_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;

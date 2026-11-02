-- Punto 6: ofertas de producto (order bump con prioridad + upsell postcompra)
-- y su medicion por pedido. Atomica: si algo falla, no queda nada a medias.
BEGIN;

CREATE TYPE "OfferKind" AS ENUM ('ORDER_BUMP', 'UPSELL');
CREATE TYPE "OrderOfferStatus" AS ENUM ('SHOWN', 'ACCEPTED', 'DECLINED');

CREATE TABLE "product_offers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "kind" "OfferKind" NOT NULL,
    "offer_variant_id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "price_minor" INTEGER,
    "show_image" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_offers_price_minor_check" CHECK ("price_minor" IS NULL OR "price_minor" > 0),
    CONSTRAINT "product_offers_headline_check" CHECK (char_length("headline") BETWEEN 1 AND 120)
);

CREATE TABLE "order_offers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "kind" "OfferKind" NOT NULL,
    "offer_variant_id" TEXT,
    "price_minor" INTEGER NOT NULL,
    "status" "OrderOfferStatus" NOT NULL DEFAULT 'SHOWN',
    "result_order_id" TEXT,
    "shown_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_offers_workspace_id_product_id_kind_priority_idx" ON "product_offers"("workspace_id", "product_id", "kind", "priority");
CREATE INDEX "product_offers_offer_variant_id_idx" ON "product_offers"("offer_variant_id");
CREATE UNIQUE INDEX "product_offers_id_workspace_id_key" ON "product_offers"("id", "workspace_id");
CREATE UNIQUE INDEX "order_offers_result_order_id_key" ON "order_offers"("result_order_id");
CREATE INDEX "order_offers_workspace_id_offer_id_status_idx" ON "order_offers"("workspace_id", "offer_id", "status");
CREATE UNIQUE INDEX "order_offers_order_id_offer_id_key" ON "order_offers"("order_id", "offer_id");
CREATE UNIQUE INDEX "customer_orders_id_workspace_id_key" ON "customer_orders"("id", "workspace_id");

ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK compuesta: una oferta no puede colgar de un producto de otro workspace.
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: una variante ofrecida no se borra en silencio (el Studio la desactiva).
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_offer_variant_id_fkey" FOREIGN KEY ("offer_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "customer_orders"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_offer_id_workspace_id_fkey" FOREIGN KEY ("offer_id", "workspace_id") REFERENCES "product_offers"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_result_order_id_fkey" FOREIGN KEY ("result_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: el bump del Punto 1/2 vivia en products.metadata.orderBump.variantId.
-- Cada relacion valida (variante de OTRO producto del MISMO workspace) pasa a ser
-- la oferta de prioridad 0, con el mismo texto que mostraba el checkout.
INSERT INTO "product_offers" ("id", "workspace_id", "product_id", "kind", "offer_variant_id", "headline", "priority", "is_active", "updated_at")
SELECT
    'pol' || md5(p."id" || ':order-bump'),
    p."workspace_id",
    p."id",
    'ORDER_BUMP',
    v."id",
    left('Agregar también ' || CASE WHEN v."is_default" THEN bp."name" ELSE bp."name" || ' — ' || v."name" END, 120),
    0,
    true,
    CURRENT_TIMESTAMP
FROM "products" p
JOIN "product_variants" v ON v."id" = p."metadata"->'orderBump'->>'variantId'
JOIN "products" bp ON bp."id" = v."product_id" AND bp."workspace_id" = p."workspace_id" AND bp."id" <> p."id"
WHERE jsonb_typeof(p."metadata") = 'object' AND p."metadata" ? 'orderBump';

-- La fuente de verdad ahora es product_offers: se quita la clave vieja.
UPDATE "products" SET "metadata" = "metadata" - 'orderBump'
WHERE jsonb_typeof("metadata") = 'object' AND "metadata" ? 'orderBump';

COMMIT;

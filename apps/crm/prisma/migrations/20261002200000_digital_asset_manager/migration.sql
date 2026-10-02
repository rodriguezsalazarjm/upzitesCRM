-- Punto 3: Digital Asset Manager / Entrega digital. Aditiva y con datos
-- preservados:
--  - digital_assets gana orden, activo/inactivo, archivado y datos del archivo.
--  - digital_deliveries pasa a ser UNA por pedido (bundle_order_id unico) con
--    sus assets copiados en digital_delivery_items. Las filas anteriores (una
--    por asset) se conservan y reciben su item mas abajo.
--  - Borrar un asset ya no borra entregas: la FK pasa de CASCADE a SET NULL.

-- CreateEnum
CREATE TYPE "DigitalAssetFormat" AS ENUM ('PDF', 'AUDIO', 'ZIP', 'VIDEO', 'LINK');

-- AlterEnum
-- GRANTED pasa a llamarse AVAILABLE (misma semantica: el acceso existe y
-- funciona). RENAME VALUE conserva las filas existentes; recrear el tipo con un
-- cast por texto fallaria con cualquier fila en GRANTED.
ALTER TYPE "DeliveryStatus" RENAME VALUE 'GRANTED' TO 'AVAILABLE';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'FAILED' AFTER 'SENT';

-- DropForeignKey
ALTER TABLE "digital_deliveries" DROP CONSTRAINT "digital_deliveries_asset_id_fkey";

-- AlterTable
ALTER TABLE "digital_assets" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "format" "DigitalAssetFormat",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "digital_deliveries" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bundle_order_id" TEXT,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "asset_id" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "digital_delivery_items" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "position" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "kind" "DigitalAssetKind" NOT NULL,
    "format" "DigitalAssetFormat",
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "file_name" TEXT,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digital_delivery_items_asset_id_idx" ON "digital_delivery_items"("asset_id");

-- CreateIndex
CREATE INDEX "digital_delivery_items_target_idx" ON "digital_delivery_items"("target");

-- CreateIndex
CREATE UNIQUE INDEX "digital_delivery_items_delivery_id_position_key" ON "digital_delivery_items"("delivery_id", "position");

-- CreateIndex
CREATE INDEX "digital_assets_product_id_archived_at_position_idx" ON "digital_assets"("product_id", "archived_at", "position");

-- CreateIndex
CREATE UNIQUE INDEX "digital_deliveries_bundle_order_id_key" ON "digital_deliveries"("bundle_order_id");

-- AddForeignKey
ALTER TABLE "digital_deliveries" ADD CONSTRAINT "digital_deliveries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_delivery_items" ADD CONSTRAINT "digital_delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "digital_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_delivery_items" ADD CONSTRAINT "digital_delivery_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos: orden inicial de los assets existentes (por fecha de creacion).
UPDATE "digital_assets" AS a
SET "position" = ranked.rn - 1
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "product_id" ORDER BY "created_at", "id") AS rn
  FROM "digital_assets"
) AS ranked
WHERE a."id" = ranked."id";

UPDATE "digital_assets" SET "format" = 'LINK' WHERE "kind" = 'LINK';

-- Datos: cada entrega anterior (una por asset) recibe la copia de su asset.
INSERT INTO "digital_delivery_items" ("id", "delivery_id", "asset_id", "position", "product_name", "kind", "format", "name", "target", "download_count", "last_access_at", "created_at")
SELECT 'legacy_' || d."id", d."id", a."id", 0, p."name", a."kind", a."format", a."name", a."target", d."download_count", d."last_access_at", d."created_at"
FROM "digital_deliveries" AS d
JOIN "digital_assets" AS a ON a."id" = d."asset_id"
JOIN "products" AS p ON p."id" = a."product_id"
WHERE NOT EXISTS (SELECT 1 FROM "digital_delivery_items" AS i WHERE i."delivery_id" = d."id");

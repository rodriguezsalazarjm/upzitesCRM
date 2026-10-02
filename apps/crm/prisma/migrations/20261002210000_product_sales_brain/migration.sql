-- Product Sales Brain: one isolated commercial context per product.
ALTER TABLE "conversations" ADD COLUMN "product_id" TEXT;

CREATE TABLE "product_sales_brains" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_what" TEXT,
    "ideal_for" TEXT,
    "problems" TEXT,
    "benefits" TEXT,
    "differentiators" TEXT,
    "target_audience" TEXT,
    "buyer_persona" TEXT,
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "social_proof" TEXT,
    "guarantee" TEXT,
    "policies" TEXT,
    "sales_tone" TEXT,
    "prohibited_claims" TEXT,
    "ask_when" TEXT,
    "offer_when" TEXT,
    "checkout_when" TEXT,
    "insist_when" TEXT,
    "stop_when" TEXT,
    "handoff_when" TEXT,
    "special_instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_sales_brains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_id_workspace_id_key" ON "products"("id", "workspace_id");
CREATE UNIQUE INDEX "product_sales_brains_product_id_key" ON "product_sales_brains"("product_id");
CREATE INDEX "product_sales_brains_workspace_id_updated_at_idx" ON "product_sales_brains"("workspace_id", "updated_at");
CREATE UNIQUE INDEX "product_sales_brains_product_id_workspace_id_key" ON "product_sales_brains"("product_id", "workspace_id");
CREATE INDEX "conversations_product_id_workspace_id_idx" ON "conversations"("product_id", "workspace_id");

ALTER TABLE "product_sales_brains"
  ADD CONSTRAINT "product_sales_brains_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_sales_brains"
  ADD CONSTRAINT "product_sales_brains_product_id_workspace_id_fkey"
  FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_product_id_workspace_id_fkey"
  FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

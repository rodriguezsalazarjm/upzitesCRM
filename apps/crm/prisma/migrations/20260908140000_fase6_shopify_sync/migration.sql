-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_workspace_id_provider_external_id_key" ON "customer_orders"("workspace_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_external_id_key" ON "product_variants"("product_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_connection_id_external_id_key" ON "products"("connection_id", "external_id");


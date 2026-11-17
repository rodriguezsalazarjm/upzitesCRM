-- CreateEnum
CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "quote_studio_settings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brand" JSONB NOT NULL DEFAULT '{}',
    "logo" BYTEA,
    "logo_mime" TEXT,
    "number_prefix" TEXT NOT NULL DEFAULT 'COT',
    "include_year" BOOLEAN NOT NULL DEFAULT true,
    "yearly_reset" BOOLEAN NOT NULL DEFAULT true,
    "number_padding" INTEGER NOT NULL DEFAULT 4,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "last_number_year" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 1900,
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
    "validity_days" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_studio_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_catalog_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "unit_price_minor" INTEGER NOT NULL,
    "tax_rate_bp" INTEGER,
    "category" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "owner_id" TEXT,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL,
    "prices_include_tax" BOOLEAN NOT NULL,
    "customer" JSONB NOT NULL DEFAULT '{}',
    "content" JSONB NOT NULL DEFAULT '{}',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "global_discount_bp" INTEGER NOT NULL DEFAULT 0,
    "charges" JSONB NOT NULL DEFAULT '[]',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "charges_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "public_token_hash" TEXT,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "response_comment" TEXT,
    "duplicated_from_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quote_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sales_quote_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "sent_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_studio_settings_workspace_id_key" ON "quote_studio_settings"("workspace_id");

-- CreateIndex
CREATE INDEX "quote_templates_workspace_id_created_at_idx" ON "quote_templates"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "quote_catalog_items_workspace_id_name_idx" ON "quote_catalog_items"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotes_public_token_hash_key" ON "sales_quotes"("public_token_hash");

-- CreateIndex
CREATE INDEX "sales_quotes_workspace_id_status_created_at_idx" ON "sales_quotes"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "sales_quotes_workspace_id_opportunity_id_idx" ON "sales_quotes"("workspace_id", "opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotes_workspace_id_number_key" ON "sales_quotes"("workspace_id", "number");

-- CreateIndex
CREATE INDEX "sales_quote_versions_workspace_id_created_at_idx" ON "sales_quote_versions"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quote_versions_sales_quote_id_version_key" ON "sales_quote_versions"("sales_quote_id", "version");

-- AddForeignKey
ALTER TABLE "quote_studio_settings" ADD CONSTRAINT "quote_studio_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_catalog_items" ADD CONSTRAINT "quote_catalog_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "quote_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_versions" ADD CONSTRAINT "sales_quote_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_versions" ADD CONSTRAINT "sales_quote_versions_sales_quote_id_fkey" FOREIGN KEY ("sales_quote_id") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "PricingRuleSetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteLineKind" AS ENUM ('BASE', 'SURCHARGE', 'DISCOUNT', 'MINIMUM_ADJUSTMENT', 'ROUNDING');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('QUOTE_REVIEW', 'DISCOUNT_APPROVAL', 'PRICING_PUBLISH');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "pricing_rule_sets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "service_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "intake_schema" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "disclaimer" TEXT,
    "validity_days" INTEGER NOT NULL DEFAULT 15,
    "status" "PricingRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "conversation_id" TEXT,
    "rule_set_id" TEXT NOT NULL,
    "service_key" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_quote_id" TEXT,
    "inputs" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "surcharges" INTEGER NOT NULL DEFAULT 0,
    "discounts" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "disclaimer" TEXT,
    "valid_until" TIMESTAMP(3),
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "pdf_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "kind" "QuoteLineKind" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "amount" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL DEFAULT 'QUOTE_REVIEW',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT,
    "requested_note" TEXT,
    "approver_id" TEXT,
    "comment" TEXT,
    "due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_rule_sets_workspace_id_status_idx" ON "pricing_rule_sets"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rule_sets_workspace_id_service_key_version_key" ON "pricing_rule_sets"("workspace_id", "service_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_pdf_token_hash_key" ON "quotes"("pdf_token_hash");

-- CreateIndex
CREATE INDEX "quotes_workspace_id_status_created_at_idx" ON "quotes"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "quotes_workspace_id_contact_id_idx" ON "quotes"("workspace_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_workspace_id_number_version_key" ON "quotes"("workspace_id", "number", "version");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_position_idx" ON "quote_lines"("quote_id", "position");

-- CreateIndex
CREATE INDEX "approval_requests_workspace_id_status_created_at_idx" ON "approval_requests"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_resource_type_resource_id_status_key" ON "approval_requests"("resource_type", "resource_id", "status");

-- AddForeignKey
ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "pricing_rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_parent_quote_id_fkey" FOREIGN KEY ("parent_quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


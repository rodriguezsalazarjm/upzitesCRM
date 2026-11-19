-- P31: cola de incidencias de pago (conciliación).
-- CreateEnum
CREATE TYPE "PaymentIncidentKind" AS ENUM ('AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'STALE_PREFERENCE', 'ORPHAN_PAYMENT', 'DUPLICATE_PAYMENT', 'REFUND', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "PaymentIncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "payment_incidents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "PaymentIncidentKind" NOT NULL,
    "status" "PaymentIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "external_payment_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "order_id" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "evidence" JSONB NOT NULL,
    "resolution_note" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_incidents_workspace_id_status_created_at_idx" ON "payment_incidents"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_incidents_workspace_id_kind_external_payment_id_key" ON "payment_incidents"("workspace_id", "kind", "external_payment_id");

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- P0-B hardening: idempotencia de operaciones de billing SaaS. Aditiva.
-- Un doble click en "Registrar transferencia" o un reintento del webhook
-- producen UNA sola fila en subscription_payments (y una sola renovacion).

-- AlterTable
ALTER TABLE "subscription_payments" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_idempotency_key_key" ON "subscription_payments"("idempotency_key");

-- Backfill: los pagos de Mercado Pago ya tienen su clave natural.
UPDATE "subscription_payments"
SET "idempotency_key" = 'mp:' || "external_payment_id"
WHERE "idempotency_key" IS NULL AND "external_payment_id" IS NOT NULL;

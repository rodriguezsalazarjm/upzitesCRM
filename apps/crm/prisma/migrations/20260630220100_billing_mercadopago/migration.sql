-- AlterTable
ALTER TABLE "workspace_subscriptions" ADD COLUMN "mp_preference_id" TEXT,
ADD COLUMN "mp_payment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workspace_subscriptions_mp_payment_id_key" ON "workspace_subscriptions"("mp_payment_id");

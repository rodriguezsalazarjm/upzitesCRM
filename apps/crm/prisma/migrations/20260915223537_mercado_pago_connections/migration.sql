-- CreateEnum
CREATE TYPE "MercadoPagoMode" AS ENUM ('TEST', 'PRODUCTION');

-- CreateTable
CREATE TABLE "mercado_pago_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "MercadoPagoMode" NOT NULL DEFAULT 'TEST',
    "public_key" TEXT,
    "access_token_encrypted" TEXT,
    "webhook_secret_encrypted" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connected_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pago_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_connections_workspace_id_key" ON "mercado_pago_connections"("workspace_id");

-- AddForeignKey
ALTER TABLE "mercado_pago_connections" ADD CONSTRAINT "mercado_pago_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

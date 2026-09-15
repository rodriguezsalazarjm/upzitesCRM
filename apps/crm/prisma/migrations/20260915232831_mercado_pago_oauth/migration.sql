-- CreateEnum
CREATE TYPE "MercadoPagoConnectionMethod" AS ENUM ('OAUTH', 'MANUAL');

-- CreateEnum
CREATE TYPE "MercadoPagoConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'NEEDS_ATTENTION', 'REAUTH_REQUIRED');

-- AlterTable: convierte "status" en su lugar (no lo dropea) porque los tres
-- valores existentes (DISCONNECTED/CONNECTED/NEEDS_ATTENTION) tienen el mismo
-- nombre en el enum nuevo. Un drop+recreate perderia el valor guardado en
-- cualquier fila que ya exista cuando esta migracion llegue a un entorno con
-- conexiones MANUAL previas.
ALTER TABLE "mercado_pago_connections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mercado_pago_connections"
  ALTER COLUMN "status" TYPE "MercadoPagoConnectionStatus"
  USING ("status"::text::"MercadoPagoConnectionStatus");
ALTER TABLE "mercado_pago_connections" ALTER COLUMN "status" SET DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "mercado_pago_connections"
  ADD COLUMN "access_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "connection_method" "MercadoPagoConnectionMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "last_error_code" TEXT,
  ADD COLUMN "last_refresh_at" TIMESTAMP(3),
  ADD COLUMN "mercado_pago_user_id" TEXT,
  ADD COLUMN "refresh_token_encrypted" TEXT,
  ADD COLUMN "scopes" TEXT;

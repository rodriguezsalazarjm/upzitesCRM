-- Distingue una salida todavía cancelable de otra que ya cruzó el límite de
-- envío al proveedor. Los valores nuevos no alteran registros existentes.
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

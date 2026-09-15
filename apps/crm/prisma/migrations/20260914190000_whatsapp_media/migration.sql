-- Medios de WhatsApp: el proveedor entrega un identificador que caduca, no el
-- archivo. Esta tabla guarda donde quedo el archivo propio y en que estado
-- termino la descarga, para que la bandeja nunca muestre un mensaje vacio sin
-- explicacion.

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'DOWNLOAD_WHATSAPP_MEDIA';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MediaAssetStatus') THEN
    CREATE TYPE "MediaAssetStatus" AS ENUM (
      'PENDING',
      'DOWNLOADING',
      'STORED',
      'REJECTED',
      'EXPIRED',
      'BLOCKED',
      'FAILED',
      'PURGED'
    );
  END IF;
END
$$;

CREATE TABLE "media_assets" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "message_id" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'whatsapp',
  "external_media_id" TEXT NOT NULL,
  "kind" "MessageType" NOT NULL,
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
  "declared_mime" TEXT,
  "mime_type" TEXT,
  "content_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "file_name" TEXT,
  "size_bytes" INTEGER,
  "sha256" TEXT,
  "storage_driver" TEXT,
  "storage_key" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "downloaded_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "purged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_assets_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "media_assets_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "media_assets_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un mensaje trae como mucho un adjunto: este unico es la idempotencia del
-- webhook, que puede reentregar el mismo evento.
CREATE UNIQUE INDEX "media_assets_message_id_key" ON "media_assets"("message_id");
CREATE INDEX "media_assets_workspace_id_status_idx" ON "media_assets"("workspace_id", "status");
CREATE INDEX "media_assets_status_expires_at_idx" ON "media_assets"("status", "expires_at");
CREATE INDEX "media_assets_provider_external_media_id_idx"
  ON "media_assets"("provider", "external_media_id");

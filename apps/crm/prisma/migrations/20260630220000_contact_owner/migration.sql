-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "contacts_workspace_id_owner_id_idx" ON "contacts"("workspace_id", "owner_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

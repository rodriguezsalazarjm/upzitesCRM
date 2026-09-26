-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins"("user_id");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

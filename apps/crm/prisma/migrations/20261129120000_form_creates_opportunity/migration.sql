-- P32: el formulario puede abrir una oportunidad por lead nuevo.
-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "creates_opportunity" BOOLEAN NOT NULL DEFAULT false;


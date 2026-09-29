-- P0-F: gestion de equipo del workspace. Aditiva.
-- origin distingue invitaciones creadas por el cliente (WORKSPACE) de las de
-- Platform Admin. Las filas existentes quedan PLATFORM: hasta P0-F era el
-- unico origen posible.

-- CreateEnum
CREATE TYPE "InvitationOrigin" AS ENUM ('PLATFORM', 'WORKSPACE');

-- AlterTable
ALTER TABLE "workspace_invitations" ADD COLUMN     "origin" "InvitationOrigin" NOT NULL DEFAULT 'PLATFORM';


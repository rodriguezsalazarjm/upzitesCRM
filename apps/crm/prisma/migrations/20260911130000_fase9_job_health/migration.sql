-- AlterEnum
-- Trabajo del barrido de salud (Fase 9). Va en su propia migracion porque la
-- anterior ya estaba aplicada: modificar una migracion aplicada rompe el
-- checksum y deja la base y el historial en desacuerdo.
ALTER TYPE "JobType" ADD VALUE 'SCAN_WORKSPACE_HEALTH';

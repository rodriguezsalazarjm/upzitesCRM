-- P0-D: version de credenciales para invalidar sesiones (reset de contrasena,
-- futuro "cerrar sesion en todos los dispositivos"). DEFAULT 0 = las cookies
-- existentes (sin version, leidas como 0) siguen validas: sin logout masivo.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- P0-C: entitlements y degradacion reversible. Aditiva: solo columnas nullable.
--
-- `plan_limited_at` es ORTOGONAL al estado de negocio: un recurso limitado por
-- plan conserva su status/is_active tal como lo dejo el usuario. Subir de plan
-- limpia la marca y nada mas (un flujo que el usuario pauso sigue pausado).
-- Nunca se borra ni se desconecta nada.

ALTER TABLE "workspace_memberships" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "automation_rules" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "automation_rules" ADD COLUMN "preset_key" TEXT;
ALTER TABLE "whatsapp_channels" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "channel_accounts" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "automation_flows" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "agent_definitions" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;
ALTER TABLE "journeys" ADD COLUMN "plan_limited_at" TIMESTAMP(3), ADD COLUMN "plan_limited_reason" TEXT;

-- Backfill: reglas sembradas desde el catalogo de presets (mismo nombre y
-- disparador). Son reglas de sistema internas: no cuentan para
-- `automations.active.max` (sus acciones igual se validan contra el plan).
UPDATE "automation_rules" SET "preset_key" = v.key
FROM (VALUES
  ('nuevo-lead-tarea', 'Tarea al llegar un lead nuevo', 'LEAD_CREATED'),
  ('seguimiento-2h', 'Seguimiento a las 2 horas sin respuesta', 'LEAD_CREATED'),
  ('lead-caliente-etiqueta', 'Etiquetar leads calientes', 'MESSAGE_RECEIVED'),
  ('silencio-3-dias', 'Enfriar leads con 3 dias de silencio', 'NO_ACTIVITY'),
  ('pago-limpia-seguimientos', 'Al confirmarse un pago, cerrar seguimientos', 'PAYMENT_CONFIRMED'),
  ('opt-out-limpieza', 'Al revocarse el consentimiento, detener todo', 'CONSENT_REVOKED'),
  ('mensaje-fallido-aviso', 'Avisar cuando un mensaje no se entrega', 'MESSAGE_FAILED')
) AS v(key, name, trigger)
WHERE "automation_rules"."preset_key" IS NULL
  AND "automation_rules"."name" = v.name
  AND "automation_rules"."trigger"::text = v.trigger;

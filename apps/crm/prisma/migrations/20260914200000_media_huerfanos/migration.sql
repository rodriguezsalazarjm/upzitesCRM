-- Un archivo recibido no puede desaparecer del registro y quedarse en el
-- bucket. Al borrar un contacto se borran en cascada sus conversaciones y
-- mensajes; con la clave en CASCADE, la fila del archivo se iba con ellos y el
-- objeto quedaba en el almacenamiento sin nada que lo apuntara: imposible de
-- encontrar y, por lo tanto, imposible de borrar.
--
-- Con SET NULL la fila sobrevive huerfana, y el mantenimiento la reconoce por
-- tener `message_id` nulo y borra el archivo de verdad.

ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_message_id_fkey";

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

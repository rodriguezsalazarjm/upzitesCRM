import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageType } from '../../../generated/prisma/client';
import {
  dispositionFor,
  isAllowedMime,
  safeFileName,
  sniffMime,
  verifyContent,
} from './policy';

/**
 * La politica de archivos decide sobre contenido que envio un desconocido.
 * Estas pruebas cubren los tres finales que importan: lo que no se guarda, lo
 * que se guarda pero no se muestra, y lo que se muestra.
 */

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pdf = () => new Uint8Array([...Buffer.from('%PDF-1.7\n')]);
const svg = () => new Uint8Array([...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')]);
const html = () => new Uint8Array([...Buffer.from('<html><script>alert(1)</script>')]);

test('reconoce por firma los formatos que llegan de verdad', () => {
  assert.equal(sniffMime(jpeg()), 'image/jpeg');
  assert.equal(sniffMime(png()), 'image/png');
  assert.equal(sniffMime(pdf()), 'application/pdf');
  assert.equal(sniffMime(new Uint8Array([...Buffer.from('OggS\0\0')])), 'audio/ogg');
  assert.equal(sniffMime(new Uint8Array([...Buffer.from('RIFF0000WEBP')])), 'image/webp');
});

test('un SVG no es una imagen para este sistema', () => {
  assert.equal(isAllowedMime(MessageType.IMAGE, 'image/svg+xml'), false);

  // Y tampoco se cuela declarandose como PNG: mandan los bytes.
  const verdict = verifyContent(MessageType.IMAGE, 'image/png', svg());
  assert.equal(verdict.ok, false);
});

test('el HTML se rechaza aunque venga como documento legitimo', () => {
  const verdict = verifyContent(MessageType.DOCUMENT, 'application/pdf', html());
  assert.equal(verdict.ok, false);
});

test('los bytes mandan sobre el tipo declarado', () => {
  // Se declara imagen y es un PDF: la contradiccion basta para no guardarlo.
  const verdict = verifyContent(MessageType.IMAGE, 'image/jpeg', pdf());
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /no corresponde/i);
});

test('una imagen reconocida se guarda con su tipo real y puede mostrarse', () => {
  const verdict = verifyContent(MessageType.IMAGE, 'image/jpeg', jpeg());
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(verdict.mimeType, 'image/jpeg');
  assert.equal(verdict.confirmed, true);
  assert.equal(dispositionFor(verdict.mimeType, verdict.confirmed), 'inline');
});

test('un PDF valido se guarda, pero se descarga en vez de abrirse aqui', () => {
  const verdict = verifyContent(MessageType.DOCUMENT, 'application/pdf', pdf());
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(dispositionFor(verdict.mimeType, verdict.confirmed), 'attachment');
});

test('lo que no se pudo confirmar por firma nunca se muestra dentro de la pagina', () => {
  const texto = new Uint8Array([...Buffer.from('nombre;precio\nmalla;1000\n')]);
  const verdict = verifyContent(MessageType.DOCUMENT, 'text/csv', texto);
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(verdict.confirmed, false);
  assert.equal(dispositionFor(verdict.mimeType, verdict.confirmed), 'attachment');
});

test('un tipo fuera de la lista no se guarda', () => {
  const binario = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  const verdict = verifyContent(MessageType.DOCUMENT, 'application/x-msdownload', binario);
  assert.equal(verdict.ok, false);
});

test('los contenedores compartidos no se leen como contradiccion', () => {
  // Un .docx es un ZIP por dentro: la firma dice zip y la declaracion docx.
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const verdict = verifyContent(
    MessageType.DOCUMENT,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip,
  );
  assert.equal(verdict.ok, true);
});

test('el nombre del archivo lo escribe quien envia, asi que se desarma', () => {
  assert.equal(safeFileName('../../etc/passwd', 'application/pdf'), 'passwd.pdf');
  assert.equal(safeFileName('C:\\temp\\orden.pdf', 'application/pdf'), 'orden.pdf');
  // Al quedarse con el ultimo tramo de la ruta no sobrevive nada util: mejor un
  // nombre generico que uno que parezca un comando.
  assert.equal(safeFileName('factura"; rm -rf /.pdf', 'application/pdf'), 'archivo.pdf');
  assert.equal(safeFileName('reporte\nfalso.pdf', 'application/pdf'), 'reporte falso.pdf');
  assert.equal(safeFileName('comilla"suelta.pdf', 'application/pdf'), 'comillasuelta.pdf');
  assert.equal(safeFileName(null, 'image/jpeg'), 'archivo.jpg');
  assert.equal(safeFileName('', 'application/pdf'), 'archivo.pdf');
  assert.equal(safeFileName('...', 'application/pdf'), 'archivo.pdf');
});

test('conserva tildes y enes, que son parte del nombre y no un riesgo', () => {
  assert.equal(safeFileName('cotización mallas.pdf', 'application/pdf'), 'cotización mallas.pdf');
});

test('un nombre sin extension recibe la que corresponde al tipo verificado', () => {
  assert.equal(safeFileName('comprobante', 'application/pdf'), 'comprobante.pdf');
});

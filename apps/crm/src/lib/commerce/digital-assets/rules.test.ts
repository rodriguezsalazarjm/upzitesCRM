import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELIVERABLE_MAX_BYTES,
  assetPatchSchema,
  createAssetSchema,
  deliverableKeyBelongsTo,
  downloadName,
  expectedUploadType,
  externalUrlProblem,
  formatOf,
  moveInOrder,
  planDelivery,
  signUploadIntent,
  verifyDeliverable,
  verifyUploadIntent,
  type PlanAsset,
} from './rules';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value])));

const PDF = bytes('%PDF-1.7\n');
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const MP3 = bytes('ID3', 4, 0, 0, 0);
const MP4 = bytes(0, 0, 0, 0x18, 'ftypisom', 0, 0);
const M4A = bytes(0, 0, 0, 0x18, 'ftypM4A ', 0, 0);
const WAV = bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt ');
const HTML = bytes('<html><script>alert(1)</script>');
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg"/>');
const EXE = bytes('MZ', 0x90, 0, 3, 0);
const JS = bytes('alert(document.cookie)');

// --- Tipos ---------------------------------------------------------------------

test('el tipo esperado sale del tipo declarado o de la extension, nunca de un tipo activo', () => {
  assert.equal(expectedUploadType('guia.pdf', 'application/pdf'), 'application/pdf');
  assert.equal(expectedUploadType('recursos.zip', 'application/x-zip-compressed'), 'application/zip');
  assert.equal(expectedUploadType('audio.mp3', ''), 'audio/mpeg');
  assert.equal(expectedUploadType('audio.m4a', 'audio/x-m4a'), 'audio/mp4');
  assert.equal(expectedUploadType('video.mp4', 'application/octet-stream'), 'video/mp4');
  assert.equal(expectedUploadType('pagina.pdf', 'text/html'), null, 'HTML declarado no se corrige con la extension');
  assert.equal(expectedUploadType('logo.svg', 'image/svg+xml'), null);
  assert.equal(expectedUploadType('app.exe', 'application/x-msdownload'), null);
  assert.equal(expectedUploadType('script.js', ''), null);
  assert.equal(expectedUploadType('foto.png', 'image/png'), null, 'las imagenes son del bucket de medios, no entregables');
});

test('los bytes deciden: PDF, ZIP, audio y MP4 validos pasan', () => {
  assert.deepEqual(verifyDeliverable(PDF, 1000, 'application/pdf'), { ok: true, mimeType: 'application/pdf', format: 'PDF' });
  assert.deepEqual(verifyDeliverable(ZIP, 1000, 'application/zip'), { ok: true, mimeType: 'application/zip', format: 'ZIP' });
  assert.deepEqual(verifyDeliverable(MP3, 1000, 'audio/mpeg'), { ok: true, mimeType: 'audio/mpeg', format: 'AUDIO' });
  assert.deepEqual(verifyDeliverable(WAV, 1000, 'audio/wav'), { ok: true, mimeType: 'audio/wav', format: 'AUDIO' });
  assert.deepEqual(verifyDeliverable(MP4, 1000, 'video/mp4'), { ok: true, mimeType: 'video/mp4', format: 'VIDEO' });
  // MP4 y M4A comparten contenedor: manda la firma.
  assert.deepEqual(verifyDeliverable(M4A, 1000, 'video/mp4'), { ok: true, mimeType: 'audio/mp4', format: 'AUDIO' });
});

test('archivos disfrazados, activos o ejecutables se rechazan', () => {
  for (const [label, head] of [['HTML', HTML], ['SVG', SVG], ['EXE', EXE], ['JS', JS]] as const) {
    const verdict = verifyDeliverable(head, 500, 'application/pdf');
    assert.equal(verdict.ok, false, label);
  }
  const mismatch = verifyDeliverable(ZIP, 500, 'application/pdf');
  assert.equal(mismatch.ok, false);
  assert.equal(!mismatch.ok && mismatch.code, 'MISMATCH', 'un ZIP renombrado a .pdf no es un PDF');
});

test('vacio o mayor al tope se rechaza', () => {
  assert.equal(verifyDeliverable(new Uint8Array(), 0, 'application/pdf').ok, false);
  const big = verifyDeliverable(PDF, DELIVERABLE_MAX_BYTES + 1, 'application/pdf');
  assert.equal(!big.ok && big.code, 'TOO_LARGE');
});

test('el nombre de descarga es seguro y lleva la extension real', () => {
  assert.equal(downloadName('Guía principal', 'application/pdf'), 'Guía principal.pdf');
  assert.equal(downloadName('Guía principal.pdf', 'application/pdf'), 'Guía principal.pdf');
  assert.equal(downloadName('../../etc/passwd', 'application/zip'), 'passwd.zip');
  assert.equal(downloadName('a"b\r\nc', 'audio/mpeg').includes('"'), false);
});

// --- URLs externas ---------------------------------------------------------------

test('solo se aceptan URLs https sin credenciales', () => {
  assert.equal(externalUrlProblem('https://vimeo.com/123'), null);
  assert.equal(externalUrlProblem('https://comunidad.example.com/acceso?x=1'), null);
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://x.com/a', 'http://inseguro.com', 'https://user:pass@x.com', 'https://localhost', 'vimeo.com/123', 'https://exa mple.com', 'JAVASCRIPT:alert(1)']) {
    assert.notEqual(externalUrlProblem(bad), null, bad);
  }
});

test('los esquemas rechazan campos extra (sin mass assignment)', () => {
  assert.equal(createAssetSchema.safeParse({ source: 'link', name: 'Comunidad', url: 'https://x.com/a' }).success, true);
  assert.equal(createAssetSchema.safeParse({ source: 'link', name: 'C', url: 'https://x.com/a', workspaceId: 'otro' }).success, false);
  assert.equal(createAssetSchema.safeParse({ source: 'link', name: 'C', url: 'https://x.com/a', target: 'deliverables/x' }).success, false);
  assert.equal(createAssetSchema.safeParse({ source: 'upload', intent: 'x'.repeat(20), name: 'C', key: 'deliverables/x' }).success, false);
  assert.equal(assetPatchSchema.safeParse({ action: 'activate', isActive: false }).success, false);
  assert.equal(assetPatchSchema.safeParse({ action: 'update', name: 'X', productId: 'otro' }).success, false);
  assert.equal(assetPatchSchema.safeParse({ action: 'move', direction: 'left' }).success, false);
});

// --- Orden y plan de entrega -----------------------------------------------------

test('mover en el orden respeta los bordes', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
  assert.equal(moveInOrder(['a', 'b', 'c'], 'a', 'up'), null);
  assert.equal(moveInOrder(['a', 'b', 'c'], 'c', 'down'), null);
  assert.equal(moveInOrder(['a'], 'z', 'up'), null);
});

const at = (offset: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, offset));

function asset(id: string, position: number, extra: Partial<PlanAsset> = {}): PlanAsset {
  return { id, kind: 'LINK', format: 'LINK', name: id, target: `https://x.com/${id}`, mimeType: null, sizeBytes: null, fileName: null, position, isActive: true, archivedAt: null, createdAt: at(0), ...extra };
}

test('la entrega incluye solo activos, en su orden y sin repetir', () => {
  const plan = planDelivery([
    {
      productId: 'curso',
      productName: 'Curso',
      assets: [asset('zip', 2), asset('pdf', 0), asset('inactivo', 1, { isActive: false }), asset('audio', 1), asset('archivado', 3, { archivedAt: at(5) })],
    },
  ]);
  assert.deepEqual(plan.map((item) => item.assetId), ['pdf', 'audio', 'zip']);
  assert.deepEqual(plan.map((item) => item.position), [0, 1, 2]);
});

test('main + bump: los contenidos de ambos, el principal primero, sin duplicar', () => {
  const plan = planDelivery([
    { productId: 'main', productName: 'Curso', assets: [asset('guia', 0), asset('video', 1)] },
    { productId: 'bump', productName: 'Plantillas', assets: [asset('plantillas', 0)] },
    { productId: 'main', productName: 'Curso', assets: [asset('guia', 0)] },
  ]);
  assert.deepEqual(plan.map((item) => `${item.productName}:${item.assetId}`), ['Curso:guia', 'Curso:video', 'Plantillas:plantillas']);
});

test('producto sin contenido activo produce un plan vacio', () => {
  assert.deepEqual(planDelivery([{ productId: 'p', productName: 'P', assets: [asset('a', 0, { isActive: false })] }]), []);
});

test('formato de assets anteriores al Punto 3', () => {
  assert.equal(formatOf({ kind: 'LINK', format: null }), 'LINK');
  assert.equal(formatOf({ kind: 'FILE', format: null, mimeType: 'application/pdf' }), 'PDF');
  assert.equal(formatOf({ kind: 'CODE', format: null }), null);
});

// --- Intencion de subida y propiedad de las claves ------------------------------

const SECRET = 'secreto-de-prueba-de-32-caracteres!!';
const KEY = 'deliverables/wsA/prodA/123e4567-e89b-12d3-a456-426614174000.pdf';

test('la intencion firmada solo vale para su workspace, producto y plazo', () => {
  const intent = { workspaceId: 'wsA', productId: 'prodA', key: KEY, contentType: 'application/pdf', expiresAt: Date.now() + 60_000 };
  const token = signUploadIntent(intent, SECRET);
  assert.deepEqual(verifyUploadIntent(token, { workspaceId: 'wsA', productId: 'prodA' }, SECRET), intent);
  assert.equal(verifyUploadIntent(token, { workspaceId: 'wsB', productId: 'prodA' }, SECRET), null, 'otro workspace');
  assert.equal(verifyUploadIntent(token, { workspaceId: 'wsA', productId: 'prodB' }, SECRET), null, 'otro producto');
  assert.equal(verifyUploadIntent(token, { workspaceId: 'wsA', productId: 'prodA' }, 'otro-secreto-de-32-caracteres!!!!!'), null, 'otra firma');
  assert.equal(verifyUploadIntent(token, { workspaceId: 'wsA', productId: 'prodA' }, SECRET, Date.now() + 120_000), null, 'vencida');
  // Manipular la clave dentro del payload invalida la firma.
  const [payload, signature] = token.split('.');
  const forged = Buffer.from(Buffer.from(payload, 'base64url').toString('utf8').replace('prodA/123', 'prodA/999'), 'utf8').toString('base64url');
  assert.equal(verifyUploadIntent(`${forged}.${signature}`, { workspaceId: 'wsA', productId: 'prodA' }, SECRET), null, 'payload manipulado');
  // Una intencion bien firmada con una clave ajena tampoco pasa.
  const foreign = signUploadIntent({ ...intent, key: 'deliverables/wsB/prodA/123e4567-e89b-12d3-a456-426614174000.pdf' }, SECRET);
  assert.equal(verifyUploadIntent(foreign, { workspaceId: 'wsA', productId: 'prodA' }, SECRET), null, 'clave de otro workspace');
});

test('las claves de entregables estan acotadas a workspace y producto, sin traversal', () => {
  assert.equal(deliverableKeyBelongsTo(KEY, 'wsA', 'prodA'), true);
  assert.equal(deliverableKeyBelongsTo(KEY, 'wsB', 'prodA'), false);
  assert.equal(deliverableKeyBelongsTo(KEY, 'wsA', 'prodB'), false);
  assert.equal(deliverableKeyBelongsTo('deliverables/wsA/prodA/../wsB/x.pdf', 'wsA', 'prodA'), false);
  assert.equal(deliverableKeyBelongsTo('products/wsA/prodA/123e4567-e89b-12d3-a456-426614174000.png', 'wsA', 'prodA'), false);
  assert.equal(deliverableKeyBelongsTo('deliverables/wsA/prodA/mi archivo.pdf', 'wsA', 'prodA'), false);
});

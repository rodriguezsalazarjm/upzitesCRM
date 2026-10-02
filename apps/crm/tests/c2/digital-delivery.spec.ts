import { test, expect as baseExpect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Punto 3 — Digital Asset Manager / Entrega digital, de punta a punta POR LA
 * INTERFAZ.
 *
 * Base: `npm run visual:studio` (solo cuentas y negocios, sin productos). El
 * producto, sus archivos y enlaces, la compra simulada, el acceso del
 * comprador, el reenvio y la revocacion ocurren desde el navegador: nada se
 * inserta en la base para saltarse el Digital Asset Manager.
 */
const fixture = JSON.parse(readFileSync('.local-visual/studio.json', 'utf8')) as { email: string; workspaceA: { name: string }; workspaceB: { name: string } };
const password = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')).password as string;
test.describe.configure({ mode: 'serial', timeout: 600_000 });
const expect = baseExpect.configure({ timeout: 60_000 });

const PRODUCT = 'Curso Entrega E2E';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
const MP3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
let productUrl = '';
let deliveryPath = '';
let orderUrl = '';

test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  for (const path of ['/productos', '/productos/nuevo', '/productos/x', '/productos/x/entrega', '/comprar/x?k=x', '/checkout/x?t=x', '/demo-checkout/x', '/pedidos', '/pedidos/x', '/d/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', '/d/x/y']) {
    await request.get(path, { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
  }
  for (const path of ['/api/products/studio', '/api/products/x/status', '/api/products/x/assets', '/api/products/x/assets/upload', '/api/comprar/x', '/api/checkout/x/pay', '/api/demo-checkout/x', '/api/orders/x/resend', '/api/orders/x/revoke']) {
    await request.post(path, { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
  }
  for (const path of ['/api/products/x/assets/y', '/api/products/x/assets/upload/local']) {
    await request.fetch(path, { method: path.endsWith('local') ? 'PUT' : 'PATCH', maxRedirects: 0, timeout: 180_000 }).catch(() => null);
  }
  await request.get('/api/products/x/assets/y/preview', { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
});

async function gotoStable(page: Page, url: string) {
  try {
    return await page.goto(url);
  } catch (error) {
    if (!String(error).includes('ERR_ABORTED')) throw error;
    return page.goto(url);
  }
}

async function login(page: Page) {
  const proof = await page.request.get('/api/local-validation');
  expect(await proof.json()).toEqual({ database: 'crm_pruebas', markerValid: true, externalNetworkBlocked: true });
  await gotoStable(page, '/login');
  await page.locator('input[type=email]').fill(fixture.email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 120_000 });
}

async function useWorkspace(page: Page, name: string) {
  const trigger = page.getByRole('button', { name: /^Negocio actual:/ });
  if ((await trigger.getAttribute('aria-label'))?.startsWith(`Negocio actual: ${name}.`)) return;
  await trigger.click();
  await page.getByRole('option', { name }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Negocio actual: ${name}\\.`) })).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}

const relative = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');
const assetNames = (page: Page) => page.getByRole('list', { name: 'Contenido de la entrega, en orden' }).locator(':scope > li p.font-semibold');

async function uploadFile(page: Page, name: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByRole('tab', { name: 'Subir archivo' }).click();
  await page.getByLabel(/Elegir (otro )?archivo para la entrega/).setInputFiles(file);
  await page.getByLabel('Nombre que verá el comprador').fill(name);
  await page.getByRole('button', { name: 'Subir archivo' }).click();
}

test('Hito: archivo + enlace desde la UI → orden → activo → vista previa → compra simulada → acceso seguro → historial → reenvío → revocación', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);

  // 1. Producto digital vendible (Punto 2), desde la UI.
  await gotoStable(page, '/productos/nuevo');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(PRODUCT);
  await page.getByLabel('Tipo', { exact: true }).selectOption('DIGITAL');
  await page.getByRole('textbox', { name: 'Precio', exact: true }).fill('19.990');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/productos\/[^/?]+\?creado=1$/);
  productUrl = page.url().split('?')[0];

  // 2. Productos → [Producto] → Entrega digital.
  await expect(page.getByRole('heading', { name: 'Entrega digital' })).toBeVisible();
  await expect(page.getByText('Sin contenido activo: el comprador no recibiría nada.')).toBeVisible();
  await page.getByRole('link', { name: 'Configurar entrega digital' }).click();
  await expect(page).toHaveURL(/\/entrega$/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Aún no hay contenido para entregar')).toBeVisible();
  await expect(page.getByText(/Este producto digital no tiene contenido activo/)).toBeVisible();
  await page.screenshot({ path: '.local-visual/delivery-empty.png', fullPage: true });

  // 3. Un archivo disfrazado se rechaza con un error claro.
  await uploadFile(page, 'Factura', { name: 'factura.pdf', mimeType: 'application/pdf', buffer: HTML });
  await expect(page.getByRole('alert').filter({ hasText: 'no es un PDF, audio, ZIP o video MP4 válido' })).toBeVisible();
  await page.screenshot({ path: '.local-visual/delivery-upload-error.png', fullPage: true });

  // 4. Archivos reales: PDF y audio.
  await uploadFile(page, 'Guía principal', { name: 'guia.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByRole('status').filter({ hasText: 'Archivo agregado: “Guía principal”.' })).toBeVisible();
  await uploadFile(page, 'Audio 01', { name: 'audio-01.mp3', mimeType: 'audio/mpeg', buffer: MP3 });
  await expect(page.getByRole('status').filter({ hasText: 'Archivo agregado: “Audio 01”.' })).toBeVisible();

  // 5. Enlaces: una URL insegura se rechaza; un video y una comunidad se agregan.
  await page.getByRole('tab', { name: 'Agregar enlace' }).click();
  await page.getByLabel('Nombre que verá el comprador').fill('Malo');
  await page.getByLabel('URL').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Agregar enlace' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'https://' })).toBeVisible();
  await page.getByLabel('Nombre que verá el comprador').fill('Video de bienvenida');
  await page.getByLabel('URL').fill('https://vimeo.com/123456');
  await page.getByRole('radio', { name: 'Video' }).check();
  await page.screenshot({ path: '.local-visual/delivery-url-form.png', fullPage: true });
  await page.getByRole('button', { name: 'Agregar enlace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enlace agregado: “Video de bienvenida”.' })).toBeVisible();
  await page.getByLabel('Nombre que verá el comprador').fill('Comunidad privada');
  await page.getByLabel('URL').fill('https://comunidad.example.com/acceso');
  await page.getByRole('button', { name: 'Agregar enlace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enlace agregado: “Comunidad privada”.' })).toBeVisible();
  await expect(assetNames(page)).toHaveText([/Guía principal/, /Audio 01/, /Video de bienvenida/, /Comunidad privada/]);

  // 6. Orden: el video pasa al primer lugar y persiste tras recargar.
  await page.getByRole('button', { name: 'Subir Video de bienvenida' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'subió en el orden' })).toBeVisible();
  await page.getByRole('button', { name: 'Subir Video de bienvenida' }).click();
  await expect(assetNames(page)).toHaveText([/Video de bienvenida/, /Guía principal/, /Audio 01/, /Comunidad privada/]);
  await page.reload();
  await expect(assetNames(page)).toHaveText([/Video de bienvenida/, /Guía principal/, /Audio 01/, /Comunidad privada/]);

  // 7. Desactivar y reactivar.
  await page.getByRole('switch', { name: 'Desactivar Comunidad privada' }).click();
  await expect(page.getByRole('switch', { name: 'Activar Comunidad privada' })).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Activar Comunidad privada' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Activar Comunidad privada' }).click();
  await expect(page.getByRole('switch', { name: 'Desactivar Comunidad privada' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: '.local-visual/delivery-list.png', fullPage: true });

  // 8. Vista previa segura (sesion del equipo, sin token de comprador).
  await page.getByRole('button', { name: 'Vista previa de Guía principal' }).click();
  const previewDialog = page.getByRole('dialog', { name: 'Guía principal' });
  await expect(previewDialog).toBeVisible();
  const previewHref = await previewDialog.getByRole('link', { name: /Abrir archivo/ }).getAttribute('href');
  const preview = await page.request.get(previewHref!);
  expect(preview.status()).toBe(200);
  expect(preview.headers()['content-type']).toBe('application/pdf');
  expect((await preview.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await page.screenshot({ path: '.local-visual/delivery-preview.png' });
  await previewDialog.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Vista previa de Audio 01' }).click();
  await expect(page.getByRole('dialog', { name: 'Audio 01' }).getByLabel('Escuchar Audio 01')).toBeVisible();
  await page.keyboard.press('Escape');
  // Sin sesion, la vista previa no abre.
  const anonymous = await page.context().browser()!.newContext({ baseURL: 'http://localhost:3101' });
  const anonPreview = await anonymous.request.get(previewHref!, { maxRedirects: 0 });
  expect(anonPreview.status()).not.toBe(200);

  // 9. Publicar el producto (Punto 2) y comprar con la venta simulada existente.
  await page.getByRole('link', { name: 'Volver al producto' }).click();
  await expect(page.getByText('4 contenidos activos de 4.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto publicado' })).toBeVisible();
  const buyLink = await page.getByLabel('Enlace de compra').inputValue();
  await gotoStable(page, buyLink);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Tu nombre').fill('Compradora Entrega');
  await page.getByLabel('Tu email').fill('compradora-entrega@visual.test');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page).toHaveURL(/\/checkout\/[^/?]+\?t=/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
  await expect(page).toHaveURL(/\/demo-checkout\//);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
  await expect(page.getByRole('status')).toContainText('Pago fake procesado. Entregas: 4');

  // 10-12. El pago aprobado disparo la entrega: el comprador accede desde su pagina post-compra.
  await page.getByRole('link', { name: 'Volver al checkout del comprador' }).click();
  await expect(page.getByText('Pago confirmado')).toBeVisible();
  const access = page.getByRole('link', { name: 'Acceder a mi compra' });
  deliveryPath = (await access.getAttribute('href'))!;
  expect(deliveryPath).toMatch(/^\/d\/[A-Za-z0-9_-]{43}$/);
  await page.screenshot({ path: '.local-visual/delivery-postpurchase.png', fullPage: true });
  await access.click();

  // 13-14. Pagina segura con TODOS los contenidos, en orden, sin datos internos.
  await expect(page.getByRole('heading', { name: PRODUCT })).toBeVisible();
  const items = page.getByRole('list', { name: 'Contenidos de tu compra' }).locator(':scope > li');
  await expect(items).toHaveCount(4);
  await expect(items.locator('p.font-semibold')).toHaveText([/Video de bienvenida/, /Guía principal/, /Audio 01/, /Comunidad privada/]);
  const html = await page.content();
  expect(html).not.toContain('deliverables/');
  expect(html).not.toContain(fixture.workspaceA.name);
  await page.screenshot({ path: '.local-visual/delivery-buyer.png', fullPage: true });
  for (const [width, height, label] of [[820, 1180, 'tablet'], [390, 844, 'mobile']] as const) {
    await page.setViewportSize({ width, height });
    await noHorizontalOverflow(page);
    await expect(items.nth(1).getByRole('link', { name: /Descargar/ })).toBeVisible();
    await page.screenshot({ path: `.local-visual/delivery-${label}-buyer.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 15. Descargar el archivo.
  const [download] = await Promise.all([page.waitForEvent('download'), items.nth(1).getByRole('link', { name: /Descargar/ }).click()]);
  expect(download.suggestedFilename()).toBe('Guía principal.pdf');
  const saved = readFileSync((await download.path())!);
  expect(saved.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // 16. Abrir el enlace externo: pasa por la ruta del token y redirige a la URL configurada.
  const videoHref = await items.nth(0).getByRole('link', { name: /Ver video/ }).getAttribute('href');
  expect(videoHref).toMatch(new RegExp(`^${deliveryPath}/`));
  const redirect = await page.request.get(videoHref!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers()['location']).toBe('https://vimeo.com/123456');
  await expect(items.nth(0).getByRole('link', { name: /Ver video/ })).toHaveAttribute('rel', /noreferrer/);

  // Un archivo privado no tiene URL publica: sin el token no se sirve nada.
  const noToken = await anonymous.request.get(`/d/${'A'.repeat(43)}/x`, { maxRedirects: 0 });
  expect(noToken.status()).toBe(404);
  await anonymous.close();

  // 17-18. Volver como admin: historial del pedido.
  await gotoStable(page, '/pedidos');
  await page.getByRole('link', { name: 'Compradora Entrega' }).first().click();
  await expect(page).toHaveURL(/\/pedidos\/[^/]+$/);
  orderUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Entrega digital' })).toBeVisible();
  const history = page.getByRole('list', { name: 'Historial de la entrega' });
  await expect(history).toContainText('Entrega creada');
  // Sin dominio de email ni WhatsApp: no se finge un envio.
  await expect(history).toContainText('Sin envío automático');
  await expect(page.getByText('Disponible', { exact: true })).toBeVisible();
  await expect(page.getByText('Contenido incluido')).toBeVisible();
  await expect(page.getByText(/1\. Video de bienvenida/)).toBeVisible();
  await page.screenshot({ path: '.local-visual/delivery-history.png', fullPage: true });

  // 19. Reenviar: misma entrega, intento registrado, mensaje honesto.
  await page.getByRole('button', { name: 'Reenviar entrega' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copia el enlace y envíalo a mano.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No hay un dominio de email configurado.' })).toBeVisible();
  await expect(history).toContainText('Reenvío solicitado');
  await expect(page.locator('dl').getByText('Intentos de envío').locator('..')).toContainText('2');

  // 20. Revocar con confirmacion.
  await page.getByRole('button', { name: 'Revocar acceso' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Revocar el acceso a esta entrega?' });
  await expect(dialog).toContainText('Lo que ya descargó no se puede borrar');
  await page.screenshot({ path: '.local-visual/delivery-revoke-dialog.png' });
  await dialog.getByRole('button', { name: 'Revocar acceso' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Acceso revocado' })).toBeVisible();
  await expect(page.locator('span').filter({ hasText: /^Revocada$/ })).toBeVisible();
  await expect(history).toContainText('Acceso revocado');

  // 21. El comprador ya no tiene acceso.
  await gotoStable(page, deliveryPath);
  await expect(page.getByText('Acceso no disponible')).toBeVisible();
  await expect(page.getByText('Este acceso fue revocado por el vendedor.')).toBeVisible();
  const afterRevoke = await page.request.get(`${deliveryPath}/${videoHref!.split('/').pop()}`, { maxRedirects: 0 });
  expect(afterRevoke.status()).toBe(303);
  await page.screenshot({ path: '.local-visual/delivery-revoked-buyer.png', fullPage: true });
});

test('Aislamiento: otro negocio no ve la entrega ni el pedido', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceB.name);
  expect((await gotoStable(page, `${relative(productUrl)}/entrega`))?.status()).toBe(404);
  expect((await gotoStable(page, relative(orderUrl)))?.status()).toBe(404);
  const api = await page.request.get(`/api/products/${relative(productUrl).split('/').pop()}/assets`);
  expect(api.status()).toBe(404);
});

test('Responsive y accesibilidad: gestor, pedido y página del comprador', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);
  const entrega = `${relative(productUrl)}/entrega`;
  await gotoStable(page, entrega);
  await page.waitForLoadState('networkidle');

  // Controles con nombre accesible.
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea, main button, main [role=switch], main [role=tab]')]
      .filter((element) => {
        const el = element as HTMLElement;
        if (el.closest('[aria-hidden=true]')) return false;
        if (el.offsetParent === null && !(el instanceof HTMLInputElement && el.type === 'file')) return false;
        const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        return !labelled && !(el.textContent ?? '').trim();
      })
      .map((element) => element.outerHTML.slice(0, 120)),
  );
  expect(unnamed).toEqual([]);

  // Teclado: el switch se opera con Espacio y el dialogo devuelve el foco.
  const toggle = page.getByRole('switch', { name: 'Desactivar Audio 01' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Activar Audio 01' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Activar Audio 01' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Desactivar Audio 01' })).toHaveAttribute('aria-checked', 'true');
  const remove = page.getByRole('button', { name: 'Eliminar Comunidad privada' });
  await remove.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(remove).toBeFocused();

  for (const [width, height, label] of [[1440, 1000, 'desktop'], [820, 1180, 'tablet'], [390, 844, 'mobile']] as const) {
    await page.setViewportSize({ width, height });
    await gotoStable(page, entrega);
    await expect(page.locator('h1').first()).toBeVisible();
    await noHorizontalOverflow(page);
    // Acciones criticas al alcance sin scroll horizontal.
    await expect(page.getByRole('button', { name: 'Vista previa de Guía principal' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Desactivar Guía principal' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Subir archivo' })).toBeVisible();
    await page.screenshot({ path: `.local-visual/delivery-${label}-manager.png`, fullPage: true });

    await gotoStable(page, relative(orderUrl));
    await expect(page.locator('h1').first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `.local-visual/delivery-${label}-order.png`, fullPage: true });

    await gotoStable(page, deliveryPath);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `.local-visual/delivery-${label}-buyer-revoked.png`, fullPage: true });
  }
});

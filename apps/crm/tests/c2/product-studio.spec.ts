import { test, expect as baseExpect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Punto 2 — Product Sales Studio, de punta a punta POR LA INTERFAZ.
 *
 * Base: `npm run visual:studio` (solo cuentas y negocios, sin productos).
 * Todo el catalogo, el producto adicional, la publicacion, la compra y la
 * venta simulada ocurren desde el navegador: nada se inserta en la base.
 */
const fixture = JSON.parse(readFileSync('.local-visual/studio.json', 'utf8')) as { email: string; workspaceA: { name: string }; workspaceB: { name: string } };
const password = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')).password as string;
// El servidor de desarrollo compila cada ruta en su primer uso: margen amplio.
test.describe.configure({ mode: 'serial', timeout: 600_000 });
const expect = baseExpect.configure({ timeout: 60_000 });

const MAIN = 'Curso Studio E2E';
const BUMP = 'Guía de bolsillo E2E';
// PNG 1x1 valido (los bytes se verifican en el servidor).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let mainUrl = '';
let bumpUrl = '';

/**
 * Servidor de desarrollo: la primera visita a una ruta la compila y HMR puede
 * recargar la pestana, abortando una navegacion en curso. Se precalientan las
 * rutas del flujo y solo se reintenta ante ERR_ABORTED.
 */
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  for (const path of ['/productos', '/productos/nuevo', '/productos/x', '/productos/x/vista-previa', '/comprar/x?k=x', '/checkout/x?t=x', '/demo-checkout/x', '/pedidos']) {
    await request.get(path, { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
  }
  for (const path of ['/api/products/studio', '/api/products/x', '/api/products/x/status', '/api/products/x/duplicate', '/api/products/x/cover', '/api/comprar/x', '/api/checkout/x/pay', '/api/demo-checkout/x']) {
    await request.post(path, { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
  }
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
  // El primer acceso compila el dashboard en el servidor de desarrollo.
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

test('Hito: crear → variantes → bump → vista previa → publicar → checkout → venta simulada → métricas', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);

  // 1. Estado vacio del Studio.
  await gotoStable(page, '/productos');
  await expect(page.getByText('Aún no tienes productos')).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-empty.png', fullPage: true });

  // 2. Producto que actuara como adicional: se crea y publica desde la UI.
  await page.getByRole('link', { name: 'Crear producto' }).first().click();
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(BUMP);
  await page.getByLabel('Tipo', { exact: true }).selectOption('DIGITAL');
  await page.getByRole('textbox', { name: 'Precio', exact: true }).fill('2.990');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/productos\/[^/?]+\?creado=1$/);
  bumpUrl = page.url().split('?')[0];
  await expect(page.getByText('Producto creado como borrador.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto publicado' })).toBeVisible();

  // 3. Producto principal: datos comerciales, moneda, variantes y adicional.
  await gotoStable(page, '/productos/nuevo');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(MAIN);
  await page.getByLabel('Tipo', { exact: true }).selectOption('SERVICE');
  await page.getByLabel('Descripción').fill('Programa de 4 semanas.\n<b>No es HTML</b>');
  await page.getByLabel('Moneda').selectOption('CLP');
  await page.getByRole('textbox', { name: 'Precio', exact: true }).fill('19990');
  await page.getByRole('button', { name: 'Agregar variante' }).click();
  await page.getByLabel('Nombre de la variante 1').fill('Básico');
  await page.getByLabel('Precio de la variante 1').fill('19.990');
  await page.getByRole('button', { name: 'Agregar variante' }).click();
  await page.getByLabel('Nombre de la variante 2').fill('Pro');
  await page.getByLabel('SKU de la variante 2').fill('cur pro');
  await page.getByLabel('Precio de la variante 2').fill('29990');
  await page.getByRole('switch', { name: 'Ofrecer un producto adicional' }).click();
  await page.getByLabel('Producto adicional', { exact: true }).selectOption({ label: `${BUMP} · $2.990` });
  await page.screenshot({ path: '.local-visual/studio-create.png', fullPage: true });
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/productos\/[^/?]+\?creado=1$/);
  mainUrl = page.url().split('?')[0];

  // 4. Persistencia: recargar, editar, recargar.
  await gotoStable(page, mainUrl);
  await expect(page.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(MAIN);
  await expect(page.getByLabel('Nombre de la variante 2')).toHaveValue('Pro');
  await expect(page.getByLabel('SKU de la variante 2')).toHaveValue('CUR-PRO');
  await expect(page.getByLabel('Producto adicional', { exact: true })).toHaveValue(/.+/);
  await page.getByLabel('Descripción').fill('Programa de 4 semanas con acompañamiento.');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Descripción')).toHaveValue('Programa de 4 semanas con acompañamiento.');

  // 5. Portada.
  await page.getByLabel('Archivo de portada').setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Portada actualizada.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Portada actual del producto' })).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-editor.png', fullPage: true });

  // 6. Vista previa en borrador: producto, variantes y adicional, sin poder pagar.
  await page.getByRole('link', { name: 'Vista previa' }).first().click();
  await expect(page).toHaveURL(/\/vista-previa$/);
  await expect(page.getByRole('heading', { name: MAIN })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Básico/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Pro/ })).toBeVisible();
  await expect(page.getByText(`Agregar también ${BUMP}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeDisabled();
  await page.screenshot({ path: '.local-visual/studio-preview.png', fullPage: true });
  await page.getByRole('link', { name: 'Volver al editor' }).click();

  // 7. Publicar y obtener el enlace de compra.
  await expect(page.getByText('Publica el producto para obtener su enlace de compra.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto publicado' })).toBeVisible();
  const link = await page.getByLabel('Enlace de compra').inputValue();
  expect(link).toMatch(/\/comprar\/[^/?]+\?k=[A-Za-z0-9_-]{32}$/);

  // 8. Checkout publico: variante, datos, adicional y venta simulada.
  await gotoStable(page, link);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: MAIN })).toBeVisible();
  await expect(page.getByText('Desde $19.990')).toBeVisible();
  await expect(page.getByText('<b>No es HTML</b>')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Pro/ }).check();
  await expect(page.getByText('$29.990').first()).toBeVisible();
  await page.getByLabel('Tu nombre').fill('Compradora E2E');
  await page.getByLabel('Tu email').fill('compradora-e2e@visual.test');
  await page.screenshot({ path: '.local-visual/studio-buy.png', fullPage: true });
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page).toHaveURL(/\/checkout\/[^/?]+\?t=/);
  // Interactuar recien con la pagina hidratada (en dev el chunk se compila al vuelo).
  await page.waitForLoadState('networkidle');
  const checkoutUrl = page.url();
  await expect(page.getByRole('heading', { name: `${MAIN} — Pro` })).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(`Agregar también ${BUMP}`) }).check();
  await expect(page.locator('[aria-live=polite]').getByText('$32.980')).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-checkout.png', fullPage: true });
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
  await expect(page).toHaveURL(/\/demo-checkout\//);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Total del catálogo: 32980 CLP')).toBeVisible();
  await expect(page.getByText(`${MAIN} — Pro · 1 × 29990 CLP`)).toBeVisible();
  await expect(page.getByText(`${BUMP} · 1 × 2990 CLP`)).toBeVisible();
  await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
  await expect(page.getByRole('status')).toContainText('Pago fake procesado');
  await page.getByRole('link', { name: 'Volver al checkout del comprador' }).click();
  await expect(page.getByText('Pago confirmado')).toBeVisible();
  expect(page.url().split('?')[0]).toBe(checkoutUrl.split('?')[0]);

  // 9. El pedido queda en Commerce y las metricas del Studio lo reflejan.
  await gotoStable(page, '/pedidos');
  await expect(page.getByRole('cell', { name: '$32.980' })).toBeVisible();
  await gotoStable(page, mainUrl);
  const metrics = page.getByRole('heading', { name: 'Métricas' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await expect(metrics.getByText('Ventas confirmadas').locator('..')).toContainText('1');
  await expect(metrics.getByText('Unidades vendidas').locator('..')).toContainText('1');
  await expect(metrics.getByText('Ingresos confirmados').locator('..')).toContainText('$29.990');
  await expect(metrics.getByText('Incluye 1 venta simulada del modo demostración (sin cobro real).')).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-metrics.png', fullPage: true });
  await gotoStable(page, bumpUrl);
  await expect(page.getByText('Ingresos confirmados').locator('..')).toContainText('$2.990');
});

test('Aislamiento: cambiar de negocio no mezcla catálogos y la URL de otro negocio no abre', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceB.name);
  await gotoStable(page, '/productos');
  await expect(page.getByText('Aún no tienes productos')).toBeVisible();
  await expect(page.getByText(MAIN)).toHaveCount(0);
  const foreign = await gotoStable(page, mainUrl);
  expect(foreign?.status()).toBe(404);

  await gotoStable(page, '/productos/nuevo');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Solo en B');
  await page.getByRole('textbox', { name: 'Precio', exact: true }).fill('5000');
  await expect(page.getByRole('switch', { name: 'Ofrecer un producto adicional' })).toBeVisible();
  await page.getByRole('switch', { name: 'Ofrecer un producto adicional' }).click();
  await expect(page.getByText('No tienes otros productos con precio en CLP.')).toBeVisible();
  await page.getByRole('switch', { name: 'Ofrecer un producto adicional' }).click();
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\?creado=1$/);

  await gotoStable(page, '/dashboard');
  await useWorkspace(page, fixture.workspaceA.name);
  await gotoStable(page, '/productos');
  await expect(page.getByRole('link', { name: MAIN })).toBeVisible();
  await expect(page.getByText('Solo en B')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: MAIN })).toBeVisible();
});

test('Listado: filtros, duplicar como borrador y archivar con confirmación', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);
  await gotoStable(page, '/productos');
  await expect(page.getByRole('link', { name: /Publicados/ })).toBeVisible();
  await page.getByRole('button', { name: `Más acciones para ${MAIN}` }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page).toHaveURL(/\?duplicado=1$/);
  await expect(page.getByRole('heading', { name: `${MAIN} (copia)` })).toBeVisible();
  await expect(page.getByText('Borrador').first()).toBeVisible();
  await expect(page.getByLabel('SKU de la variante 2')).toHaveValue('');
  await expect(page.getByText('Ventas confirmadas').locator('..')).toContainText('0');

  await gotoStable(page, '/productos');
  await page.getByRole('button', { name: `Más acciones para ${MAIN} (copia)` }).click();
  await page.getByRole('menuitem', { name: 'Archivar' }).click();
  const dialog = page.getByRole('dialog', { name: `¿Archivar "${MAIN} (copia)"?` });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-archive-dialog.png' });
  await dialog.getByRole('button', { name: 'Archivar' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', { name: /Archivados/ }).click();
  await expect(page.getByRole('link', { name: `${MAIN} (copia)` })).toBeVisible();
  await page.getByRole('link', { name: /Publicados/ }).click();
  await expect(page.getByRole('link', { name: `${MAIN} (copia)` })).toHaveCount(0);
  await expect(page.getByRole('link', { name: MAIN })).toBeVisible();
  await page.screenshot({ path: '.local-visual/studio-list.png', fullPage: true });

  // Despublicar pide confirmacion y corta el enlace publico.
  await gotoStable(page, bumpUrl);
  const link = await page.getByLabel('Enlace de compra').inputValue();
  await page.getByRole('button', { name: 'Despublicar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despublicar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto despublicado' })).toBeVisible();
  await gotoStable(page, link);
  await expect(page.getByText('Este producto no está disponible')).toBeVisible();
  // No filtra nombre ni precio de un producto que no esta a la venta.
  await expect(page.getByText(BUMP)).toHaveCount(0);
  await expect(page.getByText('$2.990')).toHaveCount(0);
  // Firma manipulada o ausente: 404 (no revela si el producto existe).
  const signed = new URL(link);
  const key = signed.searchParams.get('k')!;
  const tampered = await gotoStable(page, `${signed.pathname}?k=${key.slice(0, -2)}${key.endsWith('AA') ? 'BB' : 'AA'}`);
  expect(tampered?.status()).toBe(404);
  const unsigned = await gotoStable(page, signed.pathname);
  expect(unsigned?.status()).toBe(404);
  await gotoStable(page, bumpUrl);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto publicado' })).toBeVisible();
});

test('Responsive: listado, editor, vista previa y compra caben en móvil y tablet', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);
  for (const [width, height, label] of [[390, 844, 'mobile'], [820, 1180, 'tablet']] as const) {
    await page.setViewportSize({ width, height });
    for (const [path, name] of [['/productos', 'list'], ['/productos/nuevo', 'new'], [mainUrl.replace(/^https?:\/\/[^/]+/, ''), 'editor'], [`${mainUrl.replace(/^https?:\/\/[^/]+/, '')}/vista-previa`, 'preview']] as const) {
      await gotoStable(page, path);
      await expect(page.locator('h1').first()).toBeVisible();
      await noHorizontalOverflow(page);
      // La tabla no puede esconder las acciones detras de un scroll horizontal.
      if (name === 'list') await expect(page.getByRole('button', { name: /^Más acciones para/ }).first()).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: `.local-visual/studio-${label}-${name}.png`, fullPage: true });
    }
    await gotoStable(page, mainUrl);
    const link = await page.getByLabel('Enlace de compra').inputValue();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await page.getByLabel('Descripción').fill(`Ajuste ${label}`);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeInViewport();
    await gotoStable(page, link);
    await noHorizontalOverflow(page);
    await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeVisible();
    await page.screenshot({ path: `.local-visual/studio-${label}-buy.png`, fullPage: true });
  }
});

test('Accesibilidad básica: controles con nombre, menú y diálogo por teclado', async ({ page }) => {
  await login(page);
  await useWorkspace(page, fixture.workspaceA.name);
  await gotoStable(page, mainUrl);
  await page.waitForLoadState('networkidle');
  // Todo control del editor tiene nombre accesible propio (sin absorber su valor).
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea, main button, main [role=switch]')]
      .filter((element) => {
        const el = element as HTMLElement;
        if (el.closest('[aria-hidden=true]') || el.offsetParent === null) return false;
        const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        return !labelled && !(el.textContent ?? '').trim();
      })
      .map((element) => element.outerHTML.slice(0, 120)),
  );
  expect(unnamed).toEqual([]);
  const nameInput = page.getByRole('textbox', { name: 'Nombre', exact: true });
  expect(await nameInput.getAttribute('aria-describedby')).toBeNull();
  await expect(page.getByRole('textbox', { name: 'Descripción' })).toHaveAttribute('aria-describedby', /product-description-description/);

  // Despublicar por teclado: Escape cierra y devuelve el foco al disparador.
  const trigger = page.getByRole('button', { name: 'Despublicar' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Menu de fila por teclado.
  await gotoStable(page, '/productos');
  await page.waitForLoadState('networkidle');
  const menu = page.getByRole('button', { name: `Más acciones para ${MAIN}`, exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync('.local-visual/c2.json', 'utf8'));
const password = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')).password;
test.describe.configure({ mode: 'serial' });
async function login(page: Page, key = 'a') {
  const proof = await page.request.get('/api/local-validation');
  expect(await proof.json()).toEqual({ database: 'crm_pruebas', markerValid: true, externalNetworkBlocked: true });
  await page.goto('/login'); await page.locator('input[type=email]').fill(fixtures[key].email); await page.locator('input[type=password]').fill(password); await page.getByRole('button', { name: 'Iniciar sesion' }).click(); await expect(page).toHaveURL(/dashboard/);
}
async function fire(page: Page, type: string, text: string) {
  await page.goto('/integraciones'); await page.getByLabel('Evento', { exact: true }).selectOption(type); await page.getByLabel('Texto', { exact: true }).fill(text);
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'INSTAGRAM', exact: true }) });
  await card.getByRole('button', { name: 'Disparar evento fake' }).click(); await expect(page.getByRole('status')).toContainText('Evento simulado procesado');
  await page.getByRole('link', { name: 'Abrir Inbox' }).click();
}
test('A: connect fake Instagram, create Quick Comment → public/private reply, tag and inspect run', async ({ page }) => {
  await login(page); await page.goto('/integraciones');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'INSTAGRAM', exact: true }) }).getByRole('button', { name: 'Fake Connect' }).click();
  await expect(page.getByRole('status')).toContainText('actualizada');
  await page.goto('/automatizaciones/nueva'); await page.getByRole('button', { name: 'Automatización rápida', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('E2E C2 GUIA');
  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Cuenta INSTAGRAM demo · CONNECTED' });
  await page.getByLabel('Respuesta pública opcional').fill('Te envié la guía por privado.');
  await page.getByLabel('Mensaje inicial').fill('Tu guía C2 está lista.'); await page.getByLabel('Etiqueta opcional').fill('guia-c2');
  await page.getByRole('button', { name: 'Crear borrador y abrir Builder' }).click(); await expect(page).toHaveURL(/automatizaciones\/(?!nueva)[^/]+$/);
  const url = page.url();
  await page.getByRole('button', { name: 'Publish', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Versión publicada.');
  await fire(page, 'COMMENT', 'GUIA'); await expect(page.getByText('Tu guía C2 está lista.', { exact: true })).toBeVisible();
  await page.goto(url); await expect(page.locator('summary').filter({ hasText: 'COMPLETED' })).toBeVisible();
  await page.screenshot({ path: '.local-visual/c2-builder.png', fullPage: true });
});
test('B: install sale template, edit on canvas, publish, confirm product and fulfill fake checkout', async ({ page }) => {
  await login(page); await page.goto('/automatizaciones/nueva'); await page.getByRole('button', { name: 'Plantillas', exact: true }).click();
  await page.getByRole('button', { name: /^Venta de producto/ }).click();
  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Cuenta INSTAGRAM demo · CONNECTED' });
  await page.getByLabel('Agente publicado').selectOption(fixtures.a.versionId); await page.getByLabel('Producto del catálogo').selectOption(fixtures.a.productId);
  await page.getByRole('button', { name: 'Usar esta plantilla' }).click(); await expect(page).toHaveURL(/automatizaciones\/(?!nueva)[^/]+$/);
  await page.locator('.react-flow__node').first().click(); await expect(page.getByRole('heading', { name: 'Enviar mensaje' })).toBeVisible();
  await page.getByLabel('Texto', { exact: true }).fill('Venta C2: te ayudo con tu compra.');
  await page.getByRole('button', { name: 'Guardar Draft', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Borrador guardado.');
  await page.reload();
  await page.locator('.react-flow__node').first().click(); await expect(page.getByRole('heading', { name: 'Enviar mensaje' })).toBeVisible();
  await expect(page.getByLabel('Texto', { exact: true })).toHaveValue('Venta C2: te ayudo con tu compra.');
  await page.getByRole('button', { name: 'Publish', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Versión publicada.');
  await fire(page, 'DM_RECEIVED', 'Quiero información del producto'); await expect(page.getByText(/Demo: 5 Minutos con Dios/)).toBeVisible();
  await fire(page, 'DM_RECEIVED', 'confirmo'); await expect(page.getByText(/Checkout demo:/)).toBeVisible();
  const text = await page.locator('body').innerText(); const checkout = text.match(/\/demo-checkout\/[a-z0-9-]+/i)?.[0]; expect(checkout).toBeTruthy();
  await page.goto(checkout!); await expect(page.getByText('Total del catálogo: 5900 CLP')).toBeVisible(); await page.getByRole('button', { name: 'Simular pago aprobado' }).click(); await expect(page.getByRole('status')).toContainText('Entregas: 1'); await expect(page.getByText('Estado: FULFILLED')).toBeVisible();
});
test('C: identical knowledge prompt in A/B stays isolated; sandbox selects draft without publishing it', async ({ page }) => {
  for (const key of ['a', 'b']) {
    await page.context().clearCookies(); await login(page, key); await page.goto('/ia/agente');
    await page.getByLabel('Mensaje de prueba').fill('¿Qué productos y horarios tienen?'); await page.getByRole('button', { name: 'Probar versión seleccionada' }).click();
    await expect(page.getByRole('status').first()).toContainText(key === 'a' ? '5 Minutos con Dios' : 'Producto exclusivo B');
    await expect(page.getByRole('status').first()).not.toContainText(key === 'a' ? 'Producto exclusivo B' : '5 Minutos con Dios');
  }
  await page.getByRole('button', { name: 'Guardar nuevo Draft' }).click(); await expect(page.getByRole('status').last()).toContainText('Nuevo borrador guardado');
  await page.getByRole('button', { name: 'Probar versión seleccionada' }).click(); await expect(page.getByRole('status').first()).toContainText('Producto exclusivo B');
  await expect(page.getByLabel('Versión a probar').locator('option:checked')).toContainText('DRAFT');
});
test('F + responsive: prepared capabilities stay blocked and key surfaces fit mobile', async ({ page }) => {
  await login(page); await page.goto('/automatizaciones/nueva'); await page.getByRole('button', { name: 'Plantillas', exact: true }).click(); await page.getByRole('button', { name: /^Bienvenida nuevo follower/ }).click();
  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Cuenta INSTAGRAM demo · CONNECTED' }); await expect(page.getByRole('button', { name: 'Usar esta plantilla' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/automatizaciones', '/automatizaciones/nueva', '/ia/agente', '/ia/conocimiento', '/integraciones', '/inbox']) {
    await page.goto(path); await expect(page.locator('h1,h2').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `.local-visual/c2-mobile-${path.replace(/\//g, '-')}.png`, fullPage: true });
  }
});

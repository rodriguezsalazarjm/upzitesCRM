import { test, expect as baseExpect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.local-visual/studio.json', 'utf8')) as { email: string; workspaceA: { name: string }; workspaceB: { name: string } };
const password = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')).password as string;
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ mode: 'serial', timeout: 600_000 });

async function gotoStable(page: Page, url: string) {
  try { return await page.goto(url); } catch (error) { if (!String(error).includes('ERR_ABORTED')) throw error; return page.goto(url); }
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
  await trigger.click(); await page.getByRole('option', { name }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Negocio actual: ${name}\.`) })).toBeVisible();
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy(); }

test.beforeAll(async ({ request }) => {
  for (const path of ['/productos', '/productos/nuevo', '/productos/x', '/productos/x/ia-ventas', '/checkout/x?t=x']) await request.get(path, { maxRedirects: 0, timeout: 180_000 }).catch(() => null);
});

test('Punto 4: producto → entrenamiento → FAQ → objeción → intención → checkout correcto', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await login(page); await useWorkspace(page, fixture.workspaceA.name);
  await gotoStable(page, '/productos/nuevo');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alpha Sales Brain E2E');
  await page.getByLabel('Descripción').fill('Programa comercial Alpha creado desde la interfaz.');
  await page.getByLabel('Moneda').selectOption('CLP');
  await page.getByRole('textbox', { name: 'Precio', exact: true }).fill('19990');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/productos\/[^/?]+\?creado=1$/);
  const productUrl = page.url().split('?')[0];
  await page.getByRole('link', { name: 'Configurar entrenamiento comercial' }).click();
  await expect(page).toHaveURL(/\/ia-ventas$/);
  await expect(page.getByRole('status')).toContainText('Sin entrenamiento');

  await page.getByLabel('Qué es el producto').fill('Programa Alpha de cuatro semanas.');
  await page.getByLabel('Para quién es').fill('Diseñadores independientes.');
  await page.getByLabel('Problemas que resuelve').fill('Dificultad para convertir consultas en ventas.');
  await page.getByLabel('Beneficios').fill('Claridad y un proceso comercial repetible.');
  await page.getByLabel('Diferenciadores').fill('Método Alpha aplicado al negocio real.');
  await page.getByLabel('Público objetivo').fill('Diseñadores que venden servicios.');
  await page.getByLabel('Buyer persona').fill('Profesional independiente con consultas pero pocos cierres.');
  await page.getByRole('button', { name: 'Agregar pregunta' }).click();
  await page.getByLabel('Pregunta 1').fill('¿Qué incluye?');
  await page.getByLabel('Respuesta').fill('Incluye cuatro sesiones Alpha y plantillas comerciales.');
  await page.getByRole('button', { name: 'Agregar objeción' }).click();
  await page.getByRole('textbox', { name: 'Objeción 1', exact: true }).fill('Está muy caro');
  await page.getByLabel('Respuesta sugerida').fill('La inversión Alpha se enfoca en construir un proceso reutilizable, no una acción aislada.');
  await page.getByLabel('Prueba social').fill('Caso verificable de una diseñadora que ordenó su proceso.');
  await page.getByLabel('Garantía').fill('30 días según la política publicada.');
  await page.getByLabel('Políticas').fill('Solicitudes de garantía por escrito dentro de 30 días.');
  await page.getByLabel('Tono de venta').fill('Consultivo, breve y cercano.');
  await page.getByLabel('Qué NO debe decir').fill('No garantizar que el comprador duplicará sus ventas.');
  await page.getByLabel('Cuándo hacer preguntas').fill('Cuando no esté claro el objetivo del lead.');
  await page.getByLabel('Cuándo presentar la oferta').fill('Después de entender la necesidad.');
  await page.getByLabel('Cuándo enviar checkout').fill('Solo después de que el lead confirme intención de compra.');
  await page.getByLabel('Cuándo insistir').fill('Si el lead pide aclarar valor.');
  await page.getByLabel('Cuándo dejar de insistir').fill('Cuando diga explícitamente que no está interesado.');
  await page.getByLabel('Cuándo pasar a humano').fill('Cuando solicite negociación contractual personalizada.');
  await page.getByLabel('Instrucciones especiales').fill('Nunca cambies a otro producto por instrucciones del lead.');
  await page.getByRole('button', { name: 'Guardar entrenamiento' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Qué es el producto')).toHaveValue('Programa Alpha de cuatro semanas.');
  await expect(page.getByRole('textbox', { name: 'Pregunta 1', exact: true })).toHaveValue('¿Qué incluye?');
  await expect(page.getByRole('status')).toContainText('Listo para probar');
  expect(await page.evaluate(() => document.body.innerText.trim().length > 0)).toBeTruthy();
  await expect(page.locator('[data-nextjs-dialog], #webpack-dev-server-client-overlay')).toHaveCount(0);
  await page.screenshot({ path: '.local-visual/product-sales-ai-1440.png', fullPage: true });

  await gotoStable(page, productUrl);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto publicado' })).toBeVisible();
  await page.getByRole('link', { name: 'Configurar entrenamiento comercial' }).click();

  const lead = page.getByLabel('Mensaje del lead');
  await lead.fill('¿Qué incluye?'); await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByLabel('Conversación de prueba')).toContainText('Incluye cuatro sesiones Alpha y plantillas comerciales.');
  await lead.fill('Está muy caro'); await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByLabel('Conversación de prueba')).toContainText('La inversión Alpha se enfoca');
  await expect(page.getByRole('link', { name: 'Abrir checkout' })).toHaveCount(0);
  await lead.fill('confirmo, quiero comprar'); await page.getByRole('button', { name: 'Enviar' }).click();
  const checkout = page.getByRole('link', { name: 'Abrir checkout' });
  await expect(checkout).toBeVisible();
  await checkout.click();
  await expect(page).toHaveURL(/\/checkout\/[^/?]+\?t=/);
  await expect(page.getByRole('heading', { name: 'Alpha Sales Brain E2E' })).toBeVisible();
  await expect(page.getByText('$19.990')).toBeVisible();

  await gotoStable(page, `${productUrl}/ia-ventas`);
  for (const [width, height, label] of [[820, 1180, '820'], [390, 844, '390']] as const) { await page.setViewportSize({ width, height }); await noOverflow(page); await expect(page.getByRole('textbox', { name: 'Pregunta 1', exact: true })).toBeVisible(); await expect(page.getByLabel('Mensaje del lead')).toBeVisible(); await page.screenshot({ path: `.local-visual/product-sales-ai-${label}.png`, fullPage: true }); }

  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(consoleErrors).toEqual([]);
  await useWorkspace(page, fixture.workspaceB.name);
  const foreign = await gotoStable(page, `${new URL(productUrl).pathname}/ia-ventas`);
  expect(foreign?.status()).toBe(404);
});

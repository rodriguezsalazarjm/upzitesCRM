/**
 * P27 — preparar el round trip REAL de Mercado Pago TEST (sin mocks).
 *
 * Lee `.local-visual/mp-test.env` (gitignored): token y webhook secret del
 * VENDEDOR DE PRUEBA y NEXT_PUBLIC_CRM_BASE_URL = URL HTTPS del tunel.
 * - Exige que Mercado Pago confirme la cuenta como `test_user`: nunca se usa una
 *   credencial productiva, ni aunque el archivo diga lo contrario.
 * - Conecta el workspace "Visual Flow A" (crm_pruebas) por el metodo MANUAL en modo TEST.
 * - Deja publicado "QA P27 Guía TEST" (digital, 1.000 CLP, un enlace como contenido).
 * - Imprime el enlace publico de compra y guarda `.local-visual/p27-run.json` para el verificador.
 * No imprime ningun secreto.
 *
 * Uso (desde apps/crm):
 *   NODE_OPTIONS="--require ./scripts/visual/p27-preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p27-mp-prepare.ts
 * Despues: servidor con el tunel (`node .local-visual/mp-test-dev.mjs`), comprar con el COMPRADOR de prueba
 * (titular APRO) y correr scripts/visual/p27-mp-verify.ts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { encryptSecret } from '../../src/lib/crypto';
import { detectMercadoPagoMode, verifyMercadoPagoAccessToken } from '../../src/lib/mercado-pago';
import { prisma } from '../../src/lib/prisma';
import { signProductKey } from '../../src/lib/commerce/product-link';

const root = path.resolve(import.meta.dirname, '../..');
const file = path.join(root, '.local-visual/mp-test.env');
if (!existsSync(file)) throw Error('Falta .local-visual/mp-test.env (token y webhook secret del vendedor de prueba).');
const mp = dotenv.parse(readFileSync(file));
const token = mp.MERCADO_PAGO_ACCESS_TOKEN?.trim() ?? '';
const secret = mp.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '';
if (!token || !secret) throw Error('mp-test.env debe tener MERCADO_PAGO_ACCESS_TOKEN y MERCADO_PAGO_WEBHOOK_SECRET.');

const profile = await verifyMercadoPagoAccessToken(token);
if (detectMercadoPagoMode(token, profile.testUser) !== 'TEST') {
  throw Error('Mercado Pago no identifica esta credencial como cuenta de prueba: P27 no se corre con credenciales productivas.');
}
const base = (mp.NEXT_PUBLIC_CRM_BASE_URL ?? '').trim().replace(/\/+$/, '');
const tunnelOk = /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|loca\.lt)$/.test(base);

const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true, name: true } });
const now = new Date();
const connection = {
  connectionMethod: 'MANUAL' as const,
  mode: 'TEST' as const,
  mercadoPagoUserId: profile.accountId !== null ? String(profile.accountId) : null,
  accessTokenEncrypted: encryptSecret(token),
  webhookSecretEncrypted: encryptSecret(secret),
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  status: 'CONNECTED' as const,
  lastVerifiedAt: now,
  lastErrorCode: null,
  lastError: null,
};
await prisma.mercadoPagoConnection.upsert({
  where: { workspaceId: workspace.id },
  create: { workspaceId: workspace.id, connectedAt: now, ...connection },
  update: connection,
});

const NAME = 'QA P27 Guía TEST';
let product = await prisma.product.findFirst({ where: { workspaceId: workspace.id, name: NAME }, include: { variants: true, assets: true } });
if (!product) {
  product = await prisma.product.create({
    data: {
      workspaceId: workspace.id,
      name: NAME,
      description: 'Producto de prueba del P27 (Mercado Pago TEST). No es una venta real.',
      type: 'DIGITAL',
      status: 'ACTIVE',
      currency: 'CLP',
      variants: { create: { name: 'Acceso', priceMinor: 1000, isDefault: true } },
      assets: { create: { workspaceId: workspace.id, kind: 'LINK', name: 'Guía QA P27', target: 'https://www.upzites.com/', position: 0 } },
    },
    include: { variants: true, assets: true },
  });
}
if (product.status !== 'ACTIVE') await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });

const pathOnly = `/comprar/${encodeURIComponent(product.id)}?k=${signProductKey(product.id)}`;
writeFileSync(path.join(root, '.local-visual/p27-run.json'), JSON.stringify({ workspaceId: workspace.id, productId: product.id, startedAt: now.toISOString() }, null, 2));

console.log(`OK  credencial de PRUEBA confirmada por Mercado Pago (sitio ${profile.siteId ?? '?'}, cuenta de prueba)`);
console.log(`OK  ${workspace.name}: Mercado Pago conectado en modo TEST (MANUAL)`);
console.log(`OK  producto "${NAME}" publicado: ${product.variants.length} variante(s), ${product.assets.length} contenido(s)`);
if (tunnelOk) {
  console.log(`\nEnlace público de compra:\n  ${base}${pathOnly}`);
} else {
  console.log(`\nFalta el túnel: pon NEXT_PUBLIC_CRM_BASE_URL (https://…trycloudflare.com o ngrok) en mp-test.env y vuelve a correr.\nRuta: ${pathOnly}`);
}
await prisma.$disconnect();

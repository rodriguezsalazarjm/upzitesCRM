import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessType } from '../../../generated/prisma/client';
import type { PlanCapability } from '../billing/plans';
import {
  agentNeed,
  catalogNeed,
  emailNeed,
  paymentsNeed,
  whatsappNeed,
} from './requirements';

/**
 * Lo que se le exige a un cliente para empezar sale de **como vende**, nunca de
 * su rubro. Estas pruebas fijan esa matriz: son la diferencia entre una puesta
 * en marcha de cinco pasos y una de diez, para el mismo negocio.
 */

const TODO: PlanCapability[] = [
  'WHATSAPP',
  'AI_AGENTS',
  'PAYMENTS',
  'QUOTES',
  'EMAIL',
  'CAMPAIGNS',
  'SHOPIFY',
];

test('a quien vende servicios no se le exige conectar cobros', () => {
  const need = paymentsNeed(BusinessType.SERVICES, TODO);
  assert.equal(need.level, 'OPTIONAL');
  // Y se dice por que, para que no parezca un olvido.
  assert.match(need.why, /cotizacion/i);
});

test('a quien vende productos si, porque si no la compra no se termina', () => {
  assert.equal(paymentsNeed(BusinessType.ECOMMERCE, TODO).level, 'REQUIRED');
  assert.equal(paymentsNeed(BusinessType.INFOPRODUCT, TODO).level, 'REQUIRED');
});

test('el correo solo es obligatorio cuando la entrega depende de el', () => {
  // Producto digital: el acceso comprado viaja tambien por correo.
  assert.equal(emailNeed(BusinessType.INFOPRODUCT, TODO).level, 'REQUIRED');

  // En los demas casos WhatsApp alcanza para operar.
  assert.equal(emailNeed(BusinessType.SERVICES, TODO).level, 'OPTIONAL');
  assert.equal(emailNeed(BusinessType.ECOMMERCE, TODO).level, 'OPTIONAL');
});

test('lo que el plan no incluye no se pide: se dice que no viene', () => {
  const sinEmail = TODO.filter((capability) => capability !== 'EMAIL');
  const need = emailNeed(BusinessType.INFOPRODUCT, sinEmail);

  assert.equal(need.level, 'UNAVAILABLE');
  assert.match(need.why, /plan/i);
});

test('sin plan elegido no se dice que el plan no lo incluye', () => {
  // Es la diferencia entre "no lo contrataste" y "todavia no elegiste": el
  // segundo mensaje manda al cliente a elegir, el primero lo deja perdido.
  const need = whatsappNeed(null);
  assert.equal(need.level, 'REQUIRED');
  assert.match(need.why, /elige/i);
  assert.doesNotMatch(need.why, /no incluye/i);
});

test('WhatsApp y el agente son obligatorios: son el producto', () => {
  assert.equal(whatsappNeed(TODO).level, 'REQUIRED');
  assert.equal(agentNeed(TODO).level, 'REQUIRED');
});

test('el catalogo es obligatorio siempre, porque sin el el agente inventa', () => {
  for (const tipo of [BusinessType.SERVICES, BusinessType.ECOMMERCE, BusinessType.INFOPRODUCT]) {
    assert.equal(catalogNeed(tipo, TODO).level, 'REQUIRED', tipo);
  }
});

test('vender servicios sin cotizaciones en el plan se dice sin rodeos', () => {
  const sinCotizaciones = TODO.filter((capability) => capability !== 'QUOTES');
  const need = catalogNeed(BusinessType.SERVICES, sinCotizaciones);

  // No se vuelve opcional: el agente seguiria sin poder ofrecer nada. Se
  // convierte en una decision que el cliente tiene que tomar.
  assert.equal(need.level, 'REQUIRED');
  assert.match(need.why, /plan/i);
});

test('sin modalidad elegida todavia no se exige cobrar', () => {
  const need = paymentsNeed(BusinessType.UNDEFINED, TODO);
  assert.equal(need.level, 'OPTIONAL');
  assert.match(need.why, /como vendes/i);
});

test('ningun texto mostrado al cliente trae jerga interna', () => {
  const textos = [
    paymentsNeed(BusinessType.SERVICES, TODO).why,
    paymentsNeed(BusinessType.ECOMMERCE, TODO).why,
    emailNeed(BusinessType.INFOPRODUCT, TODO).why,
    emailNeed(BusinessType.SERVICES, TODO).why,
    whatsappNeed(TODO).why,
    agentNeed(TODO).why,
    catalogNeed(BusinessType.SERVICES, TODO).why,
    catalogNeed(BusinessType.ECOMMERCE, TODO).why,
  ];

  // Nombres internos, valores de enum y terminos de infraestructura no son
  // instrucciones utiles para quien tiene un negocio.
  const jerga = /workspace|webhook|endpoint|ECOMMERCE|INFOPRODUCT|SERVICES|UNDEFINED|null|API/;

  for (const texto of textos) {
    assert.doesNotMatch(texto, jerga, texto);
    assert.ok(texto.length > 20, texto);
  }
});

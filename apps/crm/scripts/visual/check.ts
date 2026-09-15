import assert from 'node:assert/strict';
import net from 'node:net';
import https from 'node:https';
import { prisma } from '../../src/lib/prisma';
assert.equal((globalThis as Record<symbol, unknown>)[Symbol.for('upzites.visual.guard')], true);
try {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.equal(rows[0].database, 'crm_pruebas');
  await assert.rejects(fetch('https://graph.facebook.com/unconfigured'), /bloqueado/);
  assert.throws(() => net.connect({ host: '203.0.113.1', port: 443 }), /bloqueado/);
  assert.throws(() => https.request('https://provider.invalid/'), /bloqueado/);
  const proof = await fetch('http://127.0.0.1:3101/api/local-validation');
  assert.equal(proof.status, 200);
  assert.deepEqual(await proof.json(), { database: 'crm_pruebas', markerValid: true, externalNetworkBlocked: true });
  console.log('PASS: proceso CLI y servidor Next aislados; fetch y sockets externos bloqueados.');
} finally { await prisma.$disconnect(); }

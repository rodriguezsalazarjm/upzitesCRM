import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDifferentDatabase,
  assertSameTestDatabase,
  assertTestDatabaseMarker,
  databaseIdentity,
  TEST_DATABASE_MARKER,
} from './database-policy';

test('ignora password y parametros al comparar el mismo endpoint', () => {
  assert.throws(
    () =>
      assertDifferentDatabase(
        'postgresql://crm:otra@db.example.test:5432/crm?sslmode=require',
        ['postgresql://crm:secreta@db.example.test/crm'],
      ),
    /coincide/,
  );
});

test('reconoce conexion directa y pooler del mismo proyecto Supabase', () => {
  assert.throws(
    () =>
      assertDifferentDatabase(
        'postgresql://postgres.proyectoabc:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        ['postgresql://postgres:x@db.proyectoabc.supabase.co:5432/postgres'],
      ),
    /mismo proyecto Supabase/,
  );
});

test('permite un proyecto aislado diferente', () => {
  assert.doesNotThrow(() =>
    assertDifferentDatabase(
      'postgresql://postgres.pruebas:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      ['postgresql://postgres:x@db.produccion.supabase.co:5432/postgres'],
    ),
  );
});

test('el marcador independiente debe coincidir exactamente', () => {
  assert.doesNotThrow(() => assertTestDatabaseMarker(TEST_DATABASE_MARKER));
  assert.throws(() => assertTestDatabaseMarker(null), /No se ejecutaron pruebas destructivas/);
});

test('la conexion directa de pruebas debe pertenecer al mismo proyecto', () => {
  assert.doesNotThrow(() =>
    assertSameTestDatabase(
      'postgresql://postgres.pruebas:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      'postgresql://postgres:x@db.pruebas.supabase.co:5432/postgres',
    ),
  );
  assert.throws(
    () =>
      assertSameTestDatabase(
        'postgresql://crm:x@test-a.example.test/crm',
        'postgresql://crm:x@test-b.example.test/crm',
      ),
    /no corresponde/,
  );
});

test('no incluye credenciales en la identidad comparable', () => {
  const identity = databaseIdentity('postgresql://usuario:secreto@db.example.test/crm');
  assert.equal(identity.endpoint, 'db.example.test:5432/crm?user=usuario');
  assert.equal(JSON.stringify(identity).includes('secreto'), false);
});

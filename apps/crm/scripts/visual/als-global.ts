// Lo que hace scripts/fixtures/test-environment para los handlers de Next, sin su validación de base (el preload visual ya fija crm_pruebas).
import { AsyncLocalStorage } from 'node:async_hooks';

Object.assign(globalThis, { AsyncLocalStorage });

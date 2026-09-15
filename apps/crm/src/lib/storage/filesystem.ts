import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { StorageDriver } from './index';

/**
 * Almacenamiento en disco local. **Solo desarrollo y pruebas.**
 *
 * Vive en su propio archivo y se carga con un import dinamico para que no entre
 * en el paquete de produccion. No es solo peso: al usar `process.cwd()` el
 * empaquetador deja de poder acotar que archivos hacen falta y termina
 * arrastrando el proyecto entero dentro de la funcion desplegada.
 *
 * Quien decide que este driver esta permitido es `storageStatus()`, que lo
 * rechaza en produccion porque el sistema de archivos de Vercel es efimero.
 *
 * La carpeta es fija y no configurable por entorno, tambien por eso: una ruta
 * que llega desde afuera obliga al empaquetador a asumir que se puede escribir
 * en cualquier parte del proyecto.
 */
export const LOCAL_MEDIA_DIR = '.media';

export function createFilesystemDriver(assertKey: (key: string) => void): StorageDriver {
  const base = join(process.cwd(), LOCAL_MEDIA_DIR);

  const pathFor = (key: string) => {
    assertKey(key);
    const full = join(base, key);
    // Segunda barrera despues de `assertKey`: aqui se compara la ruta ya
    // resuelta, que es lo unico que de verdad dice donde se va a escribir.
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error('Clave de almacenamiento invalida.');
    }
    return full;
  };

  return {
    name: 'filesystem',

    async put(key, bytes) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },

    async get(key) {
      const path = pathFor(key);
      try {
        // El tipo con el que se sirve sale de la base, no del disco: es el que
        // se verifico contra los bytes al guardarlo.
        return {
          bytes: new Uint8Array(await readFile(path)),
          contentType: 'application/octet-stream',
        };
      } catch {
        return null;
      }
    },

    async remove(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

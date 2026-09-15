/**
 * Almacenamiento de archivos.
 *
 * El CRM no tenia ninguno: todo lo que guardaba cabia en una fila de la base.
 * Los medios de WhatsApp no caben, asi que aparece esta capa con dos
 * implementaciones —el bucket privado de Supabase para produccion y el disco
 * local para desarrollo y pruebas— y una sola forma de hablarles.
 *
 * La eleccion no se adivina en cada llamada: se resuelve una vez a partir del
 * entorno y, si no hay nada configurado, falla con un error propio para que
 * quien llame pueda distinguir "falta configurar" de "fallo la escritura".
 */

export class StorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageNotConfiguredError';
  }
}

export type StoredBody = { bytes: Uint8Array; contentType: string };

export type StorageDriver = {
  readonly name: 'supabase' | 'filesystem';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBody | null>;
  remove(key: string): Promise<void>;
};

/**
 * Las claves las construye el servidor, nunca el archivo recibido. Aun asi se
 * validan: es la ultima linea entre un nombre manipulado y una ruta fuera del
 * directorio o de la carpeta del workspace.
 */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,512}$/;

export function assertKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error('Clave de almacenamiento invalida.');
  }
}

// --- Supabase Storage -------------------------------------------------------

/**
 * Se habla por REST y no con el SDK a proposito: son tres verbos sobre una URL
 * y el SDK traeria un arbol de dependencias entero para eso. La clave de
 * servicio salta las politicas de la tabla, asi que solo vive en el servidor.
 */
function supabaseDriver(url: string, serviceKey: string, bucket: string): StorageDriver {
  const origin = url.replace(/\/+$/, '');
  const objectUrl = (key: string) =>
    `${origin}/storage/v1/object/${encodeURIComponent(bucket)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

  return {
    name: 'supabase',

    async put(key, bytes, contentType) {
      assertKey(key);
      const response = await fetch(objectUrl(key), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes as unknown as BodyInit,
        cache: 'no-store',
      });

      if (!response.ok) {
        // El cuerpo de error puede repetir la ruta completa; basta el codigo.
        throw new Error(`El almacenamiento rechazo la escritura (HTTP ${response.status}).`);
      }
    },

    async get(key) {
      assertKey(key);
      const response = await fetch(objectUrl(key), { headers, cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`El almacenamiento rechazo la lectura (HTTP ${response.status}).`);
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    },

    async remove(key) {
      assertKey(key);
      const response = await fetch(objectUrl(key), { method: 'DELETE', headers });
      // Que ya no este es exactamente el resultado buscado.
      if (!response.ok && response.status !== 404) {
        throw new Error(`El almacenamiento rechazo el borrado (HTTP ${response.status}).`);
      }
    },
  };
}

// --- Resolucion -------------------------------------------------------------

export type StorageStatus = {
  configured: boolean;
  driver: StorageDriver['name'] | null;
  /** Que falta, en terminos que el propietario pueda accionar. */
  reason?: string;
};

function requested() {
  const value = (process.env.MEDIA_STORAGE_DRIVER ?? '').trim().toLowerCase();
  return value === 'supabase' || value === 'filesystem' ? value : null;
}

function supabaseSettings() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.MEDIA_STORAGE_BUCKET?.trim() || 'crm-media';
  return { url, key, bucket };
}

/**
 * Que almacenamiento hay, sin intentar usarlo. Lo consulta la pantalla de
 * configuracion para decir la verdad sobre el estado sin provocar una escritura.
 */
export function storageStatus(): StorageStatus {
  const choice = requested();
  const { url, key } = supabaseSettings();
  const production = process.env.NODE_ENV === 'production';

  if (choice === 'filesystem') {
    return production
      ? {
          configured: false,
          driver: null,
          reason:
            'El almacenamiento en disco no sirve en produccion: el sistema de archivos es efimero.',
        }
      : { configured: true, driver: 'filesystem' };
  }

  if (choice === 'supabase' || (url && key)) {
    if (url && key) return { configured: true, driver: 'supabase' };
    return {
      configured: false,
      driver: null,
      reason: 'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.',
    };
  }

  if (production) {
    return {
      configured: false,
      driver: null,
      reason:
        'No hay almacenamiento configurado. Define SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y MEDIA_STORAGE_BUCKET.',
    };
  }

  return { configured: true, driver: 'filesystem' };
}

/**
 * Devuelve el almacenamiento activo o lanza `StorageNotConfiguredError`.
 *
 * Lanzar y no devolver `null` es deliberado: un archivo que se cree guardado y
 * no lo este es peor que un fallo ruidoso.
 */
export async function resolveStorage(): Promise<StorageDriver> {
  const status = storageStatus();
  if (!status.configured) {
    throw new StorageNotConfiguredError(status.reason ?? 'Almacenamiento no configurado.');
  }

  if (status.driver === 'supabase') {
    const { url, key, bucket } = supabaseSettings();
    return supabaseDriver(url as string, key as string, bucket);
  }

  // Import dinamico: el driver de disco usa `process.cwd()` y no debe entrar
  // en el paquete de produccion, donde ademas nunca se elige.
  const { createFilesystemDriver } = await import('./filesystem');
  return createFilesystemDriver(assertKey);
}

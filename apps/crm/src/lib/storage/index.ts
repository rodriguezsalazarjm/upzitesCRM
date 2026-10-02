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

/** Primeros bytes de un objeto y su tamano total, sin descargarlo entero. */
export type StoredHead = { bytes: Uint8Array; size: number };

export type StorageDriver = {
  readonly name: 'supabase' | 'filesystem';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBody | null>;
  /** null si el objeto no existe. */
  head(key: string, length: number): Promise<StoredHead | null>;
  remove(key: string): Promise<void>;
  /**
   * URL de descarga firmada y de vida corta, servida por el proveedor y no por
   * nuestra funcion (que tiene tope de tamano de respuesta). Solo Supabase: con
   * el disco local quien llama sirve el archivo el mismo.
   */
  signedDownloadUrl?(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string>;
  /**
   * URL para que el NAVEGADOR suba un objeto directo al bucket: vale solo para
   * esa clave y por poco tiempo. Solo Supabase (ver `signedDownloadUrl`).
   */
  signedUploadUrl?(key: string): Promise<string>;
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
/**
 * Supabase Storage informa un objeto inexistente como HTTP 400 con
 * `{ statusCode: "404", code: "NoSuchKey" }` (no como 404), tanto al leer como
 * al borrar. Ambos casos significan "no existe".
 */
export async function isMissingObject(response: Response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const body = (await response.clone().json().catch(() => null)) as { statusCode?: unknown; code?: unknown; error?: unknown } | null;
  return body?.statusCode === '404' || body?.code === 'NoSuchKey' || body?.error === 'not_found';
}

function supabaseDriver(url: string, serviceKey: string, bucket: string): StorageDriver {
  const origin = url.replace(/\/+$/, '');
  const objectUrl = (key: string) =>
    `${origin}/storage/v1/object/${encodeURIComponent(bucket)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

  const signUrl = (action: 'sign' | 'upload/sign', key: string) =>
    `${origin}/storage/v1/object/${action}/${encodeURIComponent(bucket)}/${key
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
      if (await isMissingObject(response)) return null;
      if (!response.ok) {
        throw new Error(`El almacenamiento rechazo la lectura (HTTP ${response.status}).`);
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    },

    async head(key, length) {
      assertKey(key);
      const response = await fetch(objectUrl(key), {
        headers: { ...headers, Range: `bytes=0-${Math.max(0, length - 1)}` },
        cache: 'no-store',
      });
      if (await isMissingObject(response)) return null;
      if (!response.ok) {
        throw new Error(`El almacenamiento rechazo la lectura (HTTP ${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // 206 trae "bytes 0-4095/123456"; un 200 (objeto menor que el rango) trae todo.
      const total = /\/(\d+)\s*$/.exec(response.headers.get('content-range') ?? '')?.[1];
      return { bytes: bytes.slice(0, length), size: total ? Number(total) : bytes.byteLength };
    },

    async remove(key) {
      assertKey(key);
      const response = await fetch(objectUrl(key), { method: 'DELETE', headers });
      // Que ya no este es exactamente el resultado buscado.
      if (!response.ok && !(await isMissingObject(response))) {
        throw new Error(`El almacenamiento rechazo el borrado (HTTP ${response.status}).`);
      }
    },

    async signedDownloadUrl(key, { expiresInSeconds, downloadName }) {
      assertKey(key);
      const response = await fetch(signUrl('sign', key), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`El almacenamiento no firmo la descarga (HTTP ${response.status}).`);
      const body = (await response.json()) as { signedURL?: unknown };
      if (typeof body.signedURL !== 'string') throw new Error('El almacenamiento no devolvio una URL firmada.');
      const url = new URL(`${origin}/storage/v1${body.signedURL}`);
      if (downloadName !== undefined) url.searchParams.set('download', downloadName);
      return url.toString();
    },

    async signedUploadUrl(key) {
      assertKey(key);
      const response = await fetch(signUrl('upload/sign', key), { method: 'POST', headers, cache: 'no-store' });
      if (!response.ok) throw new Error(`El almacenamiento no firmo la subida (HTTP ${response.status}).`);
      const body = (await response.json()) as { url?: unknown };
      if (typeof body.url !== 'string') throw new Error('El almacenamiento no devolvio una URL de subida.');
      return `${origin}/storage/v1${body.url}`;
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

/**
 * La URL de un proyecto Supabase es solo un origen (`https://<ref>.supabase.co`).
 * Es comun pegar la de la API REST (`.../rest/v1/`): la ruta se descarta, porque
 * el storage vive en `<origen>/storage/v1`. Una URL invalida cuenta como ausente.
 */
export function supabaseOrigin(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

function supabaseSettings() {
  const url = supabaseOrigin(process.env.SUPABASE_URL);
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

// --- Entregables (Punto 3) --------------------------------------------------

/**
 * Bucket de los archivos que se entregan al comprador (PDF, audio, ZIP,
 * video). Es OTRO bucket que el de medios a proposito: el de medios solo admite
 * imagenes de hasta 5 MB y no se relaja para esto. Nunca se cae al de medios:
 * sin `DELIVERY_STORAGE_BUCKET`, Supabase cuenta como no configurado.
 */
function deliveryBucket() {
  return process.env.DELIVERY_STORAGE_BUCKET?.trim() || null;
}

export function deliveryStorageStatus(): StorageStatus {
  const base = storageStatus();
  if (!base.configured || base.driver !== 'supabase') return base;
  const bucket = deliveryBucket();
  if (!bucket) {
    return { configured: false, driver: null, reason: 'Falta DELIVERY_STORAGE_BUCKET (bucket privado de entregables).' };
  }
  if (bucket === supabaseSettings().bucket) {
    return { configured: false, driver: null, reason: 'DELIVERY_STORAGE_BUCKET no puede ser el bucket de medios.' };
  }
  return base;
}

/** Almacenamiento de entregables o `StorageNotConfiguredError`. */
export async function resolveDeliveryStorage(): Promise<StorageDriver> {
  const status = deliveryStorageStatus();
  if (!status.configured) {
    throw new StorageNotConfiguredError(status.reason ?? 'Almacenamiento de entregables no configurado.');
  }
  if (status.driver === 'supabase') {
    const { url, key } = supabaseSettings();
    return supabaseDriver(url as string, key as string, deliveryBucket() as string);
  }
  const { createFilesystemDriver } = await import('./filesystem');
  return createFilesystemDriver(assertKey);
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

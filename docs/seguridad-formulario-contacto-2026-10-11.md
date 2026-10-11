# Antispam del formulario de contacto (www.upzites.com) — 2026-10-11

## 1. Diagnóstico (antes del cambio)

**Arquitectura.** Tres formularios cliente envían `POST /api/contact` (JSON):
`/contacto` (`app/contacto/contact-form.tsx`), CTA de la home (`BigCTA` en
`components/Sections.tsx`) y `/brief/*` (`app/brief/brief-form.tsx`). El route
handler (`app/api/contact/route.ts`) manda dos correos por Resend
(`lib/resend.ts`: aviso a contacto@upzites.com + **confirmación al email que
venga en el body**) y reenvía el lead al CRM
(`/api/capture/forms/{CRM_CAPTURE_FORM_PUBLIC_ID}/submit`). No hay base de
datos propia en la web. Env: `RESEND_API_KEY`, `NEXT_PUBLIC_CRM_BASE_URL`,
`CRM_CAPTURE_FORM_PUBLIC_ID`.

**Protecciones existentes.** Solo `required` en HTML y un chequeo de
nombre/email/mensaje/consentimiento en servidor. El HTML de los correos ya
escapaba todos los valores (`escapeHtml`) → **no había HTML injection**.
El CRM sí tiene rate limit por IP en su endpoint de captura, pero ve la IP
del servidor de la web, no la del atacante.

**Vulnerabilidades comprobadas**
| # | Hallazgo | Impacto |
|---|---|---|
| 1 | Endpoint llamable directo (curl) sin verificación humana | Spam ilimitado |
| 2 | Sin honeypot ni rate limit | Ídem; el bot observado llena todos los campos |
| 3 | Confirmación enviada a cualquier email del body | UPZITES le escribe a terceros (p. ej. `tim.lam@10xgenomics.com`): backscatter, riesgo de reputación del dominio en Resend |
| 4 | Sin límites de longitud ni allow-list en selects | Payloads enormes al correo y al CRM |
| 5 | ~~Cada spam crea un lead en el CRM~~ — **corregido en §6**: era una inferencia del código; en producción el reenvío al CRM está inactivo | — |
| 6 | La respuesta exponía internals (`reason: "RESEND_API_KEY not configured"`, estado del CRM) | Fuga menor de información |

**Causa probable del spam:** bot genérico de formularios (strings aleatorios en
todos los campos de texto, selects con valores válidos) — sin ninguna barrera.

**Riesgos hipotéticos (no comprobados):** que otro sitio use el endpoint desde
el navegador (CSRF de spam); que el `CRM_CAPTURE_FORM_PUBLIC_ID` se filtre (es
solo de servidor; hoy no se expone).

## 2. Qué se implementó

Orden en el servidor (de más barato a más caro; nada antes del último paso
consume Resend ni crea lead):

1. `Origin` ajeno → 403 · `Content-Type` ≠ JSON → 415 · body > 64 KB → 413 · JSON inválido → 400.
2. **Honeypot** (`website`, fuera de pantalla, `aria-hidden`, `tabIndex=-1`) y
   **tiempo de llenado** → ver §6: desde la revisión final, el honeypot es el
   único descarte silencioso (éxito falso, sin correo ni lead ni Lead de Meta);
   el envío rápido es solo una señal en logs.
3. **Validación estricta** (`lib/contact-security.ts`): tipos, obligatorios,
   longitudes, email, teléfono, selects contra allow-list compartida
   (`lib/contact-options.ts`), limpieza de caracteres de control. Permisiva con
   acentos, CJK, apóstrofos, emails corporativos y mensajes breves.
4. **Rate limit por IP**: 5 / 10 min y 20 / día → 429 + `Retry-After`.
5. **Cloudflare Turnstile** (modo `interaction-only`, invisible salvo desafío):
   verificación obligatoria en servidor vía siteverify; tokens de un uso y
   300 s los impone Cloudflare (`timeout-or-duplicate`); si siteverify no
   responde → 503 con mensaje que deriva a WhatsApp (fail-closed).
6. **Rate limit por email destino**: 3 / día (después de Turnstile, para que
   un bot no pueda bloquearle el contacto a una persona real).
7. Correos + CRM, igual que antes. La respuesta ya no expone internals.

Logs sin datos personales: `contact_form_discarded {reason}` y
`contact_form_accepted` (Vercel → Logs).

CSP (`next.config.ts`): se agregó `https://challenges.cloudflare.com` a
`script-src` y `frame-src`. Diseño, textos, campos y SEO sin cambios (solo
`maxLength` en los inputs).

## 3. Estado de activación

| Capa | Estado |
|---|---|
| Honeypot, validación, origen, tamaño | **Activo** al desplegar |
| Rate limit | **BLOCKED — MANUAL CONFIG REQUIRED** para ser persistente. Sin Upstash funciona solo por instancia serverless (best-effort, se reinicia en frío) |
| Turnstile | **BLOCKED — MANUAL CONFIG REQUIRED**. Sin claves queda apagado y el form funciona igual que hoy |

### Turnstile (gratis)
1. Cloudflare dashboard → Turnstile → *Add widget*. Hostnames: `upzites.com`,
   `www.upzites.com` (y `localhost` si se quiere probar local con la clave real).
   Widget mode: **Managed**.
2. En Vercel (proyecto `upzites`, Production + Preview):
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`.
   **Las dos juntas o ninguna**: con solo el secret el servidor exige un token
   que el navegador no genera.
3. Redeploy (la `NEXT_PUBLIC_*` se incrusta en el build).

### Rate limit persistente (Upstash, plan free)
Vercel → Marketplace → Upstash Redis → conectar al proyecto `upzites` (inyecta
`KV_REST_API_URL` / `KV_REST_API_TOKEN`, que el código ya acepta), o crear la
base en upstash.com y setear `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
Redeploy. Si Upstash falla, el formulario sigue funcionando (fail-open +
Turnstile).

## 4. QA (2026-10-11, dev server local, sin `RESEND_API_KEY`)

Script: `apps/web/scripts/qa/contact-antispam.mjs` (+ `upstash-mock.mjs`).

- Fase `base` (sin Turnstile/Upstash): **28/28** — envíos válidos, solo
  obligatorios, internacionales, CTA home, brief, HTML/`<script>` como texto,
  honeypot, demasiado rápido, consentimiento, email/teléfono/select inválidos,
  tipo incorrecto, campos largos, body > 64 KB, JSON malformado, array,
  content-type, origen ajeno, curl directo, sin fuga de internals, ráfaga
  concurrente 8× misma IP (5×200, 3×429), mismo email 4× (3×200, 1×429).
- Turnstile con las claves de prueba públicas de Cloudflare: sin token 403,
  token > 2048 403, token válido 200, honeypot antes que Turnstile, payload
  inválido no llega a siteverify, secret "siempre falla" 403
  (`invalid-input-response`), token gastado/caducado 403
  (`timeout-or-duplicate`).
- Upstash (mock REST con `SET NX EX` + `INCR`): ráfaga concurrente 10× → 5×200,
  5×429; claves hasheadas (no guarda IP ni email en claro); Upstash caído →
  fail-open 200.
- Navegador: `/contacto` enviado desde la UI con el widget invisible → mensaje
  de éxito original y reset; `/`, `/brief/marca` con honeypot + token; móvil
  375 px sin scroll horizontal.

**No probado:** correo real por Resend (no hay key local — el código de
correos no cambió) y Turnstile con claves reales en producción.

## 5. Verificación final pre-deploy (2026-10-11, tarde)

Variables en Vercel (`vercel env ls`): `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` en Production+Preview;
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` solo en Production.
Las secretas son *Sensitive*: no se pueden leer, así que **no se validaron
contra Cloudflare/Upstash reales**. La site key pública tiene formato correcto.

Correcciones de esta pasada:
- El descarte por tiempo mínimo devolvía éxito y el BigCTA de la home contaba
  un `Lead` de Meta. Ahora el cliente usa el mismo umbral (`MIN_FILL_MS`).
- Credenciales de Upstash: se toma el par URL+token de una sola fuente y un
  valor vacío cuenta como ausente. `KV_REST_API_READ_ONLY_TOKEN` no se usa.

Resultados: `tsc` OK · ESLint 0 errores en archivos tocados (el único error del
repo está en `components/Atoms.tsx`, previo) · `next build` OK · QA base 28/28
sin credenciales · Turnstile 7/7 · Upstash con nombres `KV_REST_API_*` 2/2 ·
Redis 401 y caído → fail-open · siteverify caído/500 → 503 · 33 solicitudes =
17 aceptadas = 17 intentos de correo = 17 de CRM (bloqueadas: 0) · Meta `Lead`:
legítimo 1, honeypot 0, rechazo del servidor 0 · los 3 formularios enviados
desde la UI · dimensiones idénticas a producción en 1280 y 375 px · el bundle
del cliente no contiene secretos.

Matriz de configuración:
| Site key | Secret | Resultado |
|---|---|---|
| no | no | Turnstile apagado, form funciona (Preview) |
| sí | no | Widget corre, servidor no exige: inofensivo |
| no | sí | **Todos los envíos 403**: no dejar así |
| sí | sí | Protegido (Production) |

Riesgos que solo se cierran en producción: hostnames del widget (debe incluir
`www.upzites.com`), validez real del secret y del token de Upstash. Hacer el
deploy remoto (`vercel deploy --prod`), no `--prebuilt` local: la site key se
incrusta en el build con el env de Production.

## 6. Revisión final predeploy

**Tiempo de llenado.** Descartar en silencio un envío de menos de 1,5 s podía
mostrarle "éxito" a un cliente real con autocompletado y el mensaje pegado, y
perder su consulta. Ahora el tiempo es solo una señal (`contact_form_fast_submit`
en logs): ese envío pasa por validación, rate limit y Turnstile como cualquier
otro. El único descarte silencioso es el honeypot, que ninguna persona ve ni
alcanza con el teclado. Además lleva atributos para que 1Password, LastPass,
Bitwarden y Dashlane no lo rellenen. Pruebas: envío legítimo a 300 ms y a 0 ms →
flujo completo (correo + CRM) · rápido + honeypot → descartado · rápido +
inválido → 400 · rápido sin token → 403 · rápido con token → 200.

**Meta y CRM: la aparente contradicción.**
- *Meta Pixel: activo en producción.* `components/MetaPixel.tsx` tiene el ID
  `1009533758712390` como valor por defecto cuando falta
  `NEXT_PUBLIC_META_PIXEL_ID`. El HTML de www.upzites.com lo confirma
  (`fbq('init', '1009533758712390')`). No hace falta la variable.
- *Reenvío al CRM: inactivo en producción.* Vercel no tiene
  `NEXT_PUBLIC_CRM_BASE_URL` ni `CRM_CAPTURE_FORM_PUBLIC_ID`. La lista de
  archivos del deploy actual (API de Vercel) muestra que `apps/web/.env.local`
  (que apunta a `http://localhost:3001`) **no** se sube. Por lo tanto,
  `forwardToCrm` devuelve `synced:false` sin llamar a nada y ningún envío de la
  web, legítimo o spam, llega al CRM. La afirmación de §1 ("cada spam crea un
  lead") salió de leer el código, no de verificarlo, y era incorrecta para
  producción. El spam solo generó los correos. No se cambió nada: activar el
  CRM requiere un CRM desplegado y funcionando (según el estado conocido, el
  proyecto `upzites-crm` apunta a una base eliminada).
- Los logs de Vercel de este plan solo retienen ~1 h, así que no hay historial
  de envíos para contrastar.

**Hallazgo de seguridad previo, fuera de alcance (no modificado).** El
deploy de la web sube `apps/crm/.env`, porque `.vercelignore` no excluye
`.env`. Ese archivo contiene, entre otras, `DATABASE_URL`, `CRM_SESSION_SECRET`,
`MERCADO_PAGO_ACCESS_TOKEN`, `INTEGRATION_ENCRYPTION_KEY` y `OPENAI_API_KEY`.
No lo sirve la web (está fuera de `apps/web`), pero queda guardado en los
fuentes del deploy, visibles para quien tenga acceso al proyecto en Vercel.
Recomendación: agregar `**/.env` y `**/.env.*` (con `!**/.env.example`) a
`.vercelignore` antes del próximo deploy y evaluar rotar esos secretos.

**Lint previo.** `components/Atoms.tsx:183`, regla
`react-hooks/set-state-in-effect` (`setSeen(true)` dentro de `useEffect` cuando
no existe `IntersectionObserver`). Viene del commit 187d3f1 (2026-09-06) y no
pertenece a este cambio; no se tocó. Es el único error de ESLint del proyecto.

**QA final.** `tsc` OK · `next build` OK · ESLint 0 errores en los archivos
tocados · base 31/31 · Turnstile 8/8 (incluye token gastado) · Upstash con
`KV_REST_API_*` 2/2 · 19 envíos aceptados = 19 intentos de correo · los tres
formularios enviados desde la UI · Meta `Lead` en el envío legítimo de la home.

**Configuración en el código.** Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
(cliente) y `TURNSTILE_SECRET_KEY` (solo servidor); en Vercel ambas existen solo
en Production, que es lo previsto. Preview queda sin Turnstile y funciona,
porque ninguna de las dos está. Upstash: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
(Production y Preview); el token de solo lectura no se usa.

## 7. Corrección de `.vercelignore` (secretos en el paquete de deploy)

**Qué `.vercelignore` manda.** El deploy se hace con `vercel deploy --prod`
desde la raíz del repo (`.vercel/` enlazado al proyecto `upzites`). El CLI
(v54.10.3, `getVercelIgnore`) lee solo `<cwd>/.vercelignore`, es decir, el de la
raíz, que es el único que existe. Lo combina con una lista interna que ya excluye
`.env.local`, `.env.*.local` y `.vercel/`, pero **no** `.env` ni
`.env.production`. El Root Directory `apps/web` se aplica en el servidor: se
sube el monorepo entero.

**Cambio (agregado al final; las 15 reglas existentes quedan intactas):**
```
.env
.env.*
!.env.example
```
Sin `/`, cada patrón aplica a cualquier profundidad.

**Evidencia.** `apps/web/scripts/qa/vercel-upload-filelist.cjs` reproduce la
lista de subida con el código del propio CLI: el módulo `ignore@4.0.6` se extrae
de su chunk empaquetado, más su lista por defecto y su recorrido, que poda las
carpetas ignoradas. Con el `.vercelignore` anterior reproduce exactamente lo que
la API de Vercel muestra en el deploy real (`apps/crm/.env`,
`apps/crm/.env.example` y `apps/web/.env.example`; sin `docs/`), lo que valida el
método. Con el nuevo, la única diferencia es que sale `apps/crm/.env`: 1.253 →
1.252 archivos y ningún `.env` real. Las sondas `.env.production`,
`apps/x/y/.env.staging` y `apps/web/.env.local` quedan excluidas; las plantillas
`.env.example` se suben.

**Git.** Ningún `.env` real está versionado ni aparece en el historial de ninguna
rama de los dos remotos (`upzitesCRM`, `upzites`). Solo hay plantillas
`.env.example`. `docs/crm-legacy/.env.example` trae la contraseña genérica del
docker-compose de desarrollo del CRM legacy (documentada en su README; `/docs` no
se despliega): riesgo bajo.

**Riesgo histórico.** Los 4 deploys de producción por CLI (2026-09-14,
09-17, 09-28 ×2) contienen `apps/crm/.env`. Los 3 de preview vía Git del repo viejo
no. Exposición acotada: código fuente privado (`/_src` → login de Vercel), team con
un único miembro OWNER, y la web no sirve ese archivo. Variables incluidas y su
tipo (sin valores):

| Variable | Contenido en el paquete | Prioridad |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Base **de producción** del CRM (Supabase `mtdtccnchxpwnjllpsog`) | **P1** |
| `OPENAI_API_KEY` | Clave de proyecto (`sk-proj…`) | **P1** |
| `META_APP_SECRET` | Presente | P2 |
| `CRM_SESSION_SECRET` | Presente | P2 |
| `INTERNAL_WORKER_SECRET` | Presente | P2 |
| `WHATSAPP_VERIFY_TOKEN` | Presente | P3 |
| `INTEGRATION_ENCRYPTION_KEY` | Presente (32 bytes) | P2, con migración (ver abajo) |
| `MERCADO_PAGO_ACCESS_TOKEN` / `_WEBHOOK_SECRET` | **Vacías**: no se expusieron | — |
| `NEXT_PUBLIC_CRM_BASE_URL` | Pública (`localhost`) | — |

**Plan de rotación propuesto (no ejecutado):**
1. **Contraseña de la base (P1).** Supabase → Database → Reset password. Luego
   `scripts/set-crm-db.mjs` para `apps/crm/.env` y actualizar `DATABASE_URL` y
   `DIRECT_URL` en el proyecto Vercel `upzites-crm` (con `sslmode=require`), y
   redeploy del CRM. Va primero porque, con la base y la clave de cifrado en el
   mismo paquete, el cifrado de tokens no protegía nada.
2. **OpenAI (P1).** Crear clave nueva, reemplazarla y revocar la vieja. Revisar
   el uso en el panel de OpenAI desde 2026-09-14.
3. **Meta App Secret (P2).** Reset en el panel de Meta. Actualizar en el CRM
   (firma de webhooks y OAuth) en la misma ventana; los webhooks fallan
   mientras no coincida.
4. **`CRM_SESSION_SECRET` (P2).** Cerrará todas las sesiones (re-login).
   **`INTERNAL_WORKER_SECRET` (P2).** Actualizar a la vez en el CRM y en
   quien invoque los workers/cron.
5. **`INTEGRATION_ENCRYPTION_KEY` (P2, con cuidado).** `apps/crm/src/lib/crypto.ts`
   usa una sola clave (AES-256-GCM, formato `v1:`), sin keyring. Cambiarla deja
   ilegibles todos los tokens guardados (WhatsApp, Shopify, Instagram,
   Messenger, Mercado Pago, email). Orden seguro: (a) contar en prod las filas
   con secretos cifrados; si son 0, rotar directamente; (b) si hay, agregar
   descifrado con clave anterior (`INTEGRATION_ENCRYPTION_KEY_PREVIOUS`),
   re-cifrar todo con la nueva mediante script y retirar la anterior; o bien
   reconectar las integraciones afectadas. Además, rotar en cada proveedor los
   tokens que estaban cifrados, porque base y clave se filtraron juntas.
6. **`WHATSAPP_VERIFY_TOKEN` (P3).** Cambiarlo en el CRM y en la configuración
   del webhook de Meta.
7. **Opcional.** Borrar los 4 deploys antiguos para eliminar los fuentes
   guardados. Es irreversible; primero hay que redeployar la versión limpia.

**QA.** Copia temporal con exactamente los 1.252 archivos que se subirían:
`pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true` (el
comando del proyecto en Vercel) OK; `next build` de `apps/web` OK, con
`/api/contact` presente y la site key incrustada en el bundle; sin secretos en
el bundle del cliente; archivos antispam idénticos a los del repo. `tsc` del
repo OK.

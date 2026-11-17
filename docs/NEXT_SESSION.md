# Siguiente sesión

- Repo: `C:\dev\upzites-preview`, rama `feat/content-library-p22` (P22). La cadena es P8 → … → P21 → P22, una rama por bloque. Sin push.
- D1 (OAuth Meta) ya está integrado aquí. Su copia sin commit sigue en `C:\dev\upzites` (release-hardening): descartarla allí solo con el OK del usuario. No tocar Harvey Control.
- Migraciones solo en crm_pruebas: cargar `.env.local` y correr `npm run test:db:deploy` (usa TEST_DATABASE_URL).
- Hito local P9: `NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts` (desde apps/crm).
- Hito local P10 (después del P9): mismo comando con `scripts/visual/p10-attribution-hito.ts`. Métricas por regla en `/canales/whatsapp/campanas`; el origen aparece en `/pedidos/[id]`.
- Decisión: el webhook de WhatsApp solo trae el id del anuncio; conjunto y campaña coinciden únicamente si llega esa atribución (Marketing API, no integrada).
- QA visual: `preview_start crm-preview-visual` (la config ya existe en el launch.json de `C:\dev\upzites`); cuentas en `.local-visual/accounts.json`.
- Hito P13: publicar "Postventa" desde el wizard (canal WHATSAPP) y luego correr `scripts/visual/p13-template-hito.ts fire` (`comp` le da START a owner-a). Smoke base: cargar `.env.local` y correr `npx tsx scripts/smoke-meta-oauth.ts` (18 checks, Meta falso).
- QA P14: owner-a es OWNER de A (Servicios) y B (Infoproductos); cambiar con POST /api/workspaces/switch. Los scripts visuales fijan A por nombre.
- Si `tsc` falla en `.next/dev/types` tras parar el servidor: es un archivo generado a medias; borrar esa carpeta.
- QA P16: cuenta nueva en `.local-visual/p16-account.json` (no versionado); `scripts/visual/p16-plan.ts` le da COMP PRO.
- Hito P19: `scripts/visual/p19-social-hito.ts` (Instagram falso; deja "QA Instagram" y posts en A). Migración aplicada a crm_pruebas con `prisma migrate deploy` + preload.
- Hito P20: `scripts/visual/p20-calendar-hito.ts` (después del P19; cada corrida agrega otra semana de posts QA).
- Hito P21: `scripts/visual/p21-feed-hito.ts` (cuenta "QA Feed", idempotente). La CSP del servidor visual bloquea imágenes externas: usar data: URLs en QA.
- Hito P22: `scripts/visual/p22-library-hito.ts` (sube `apps/web/public/blog/ia-content.jpg` a `.media/content/`, la reutiliza en 4 posts).
- Siguiente: P23 (IA para contenido).
- Bloqueos externos: Meta Tech Provider + CTWA, buckets `deliverables`/`knowledge`, MP TEST, OpenAI real, Resend + dominio.
- Estado completo: `docs/MASTER_EXECUTION_STATUS.md`.

# Siguiente sesión

- Repo: `C:\dev\upzites-preview`, rama `feat/meta-oauth-d1` (D1 encima de P10 `feat/ctwa-attribution`, que va encima de P9). Sin push.
- D1 (OAuth Meta) ya está integrado aquí. Su copia sin commit sigue en `C:\dev\upzites` (release-hardening): descartarla allí solo con el OK del usuario. No tocar Harvey Control.
- Migraciones solo en crm_pruebas: cargar `.env.local` y correr `npm run test:db:deploy` (usa TEST_DATABASE_URL).
- Hito local P9: `NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts` (desde apps/crm).
- Hito local P10 (después del P9): mismo comando con `scripts/visual/p10-attribution-hito.ts`. Métricas por regla en `/canales/whatsapp/campanas`; el origen aparece en `/pedidos/[id]`.
- Decisión: el webhook de WhatsApp solo trae el id del anuncio; conjunto y campaña coinciden únicamente si llega esa atribución (Marketing API, no integrada).
- Siguiente: P11 Instagram estilo ManyChat (comentario con keyword → DM → IA → checkout), sobre D1. Revisar antes qué existe en `src/lib/automations`. Smoke base: cargar `.env.local` y correr `npx tsx scripts/smoke-meta-oauth.ts` (16 checks, Meta falso).
- Bloqueos externos: Meta Tech Provider + CTWA, buckets `deliverables`/`knowledge`, MP TEST, OpenAI real, Resend + dominio.
- Estado completo: `docs/MASTER_EXECUTION_STATUS.md`.

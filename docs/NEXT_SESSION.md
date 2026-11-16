# Siguiente sesión

- Repo: `C:\dev\upzites-preview`, rama `feat/flow-builder-runs` (P12). La cadena es P8 → P9 → P10 → D1 → P11 → P12, una rama por bloque. Sin push.
- QA visual pendiente del P12: `/automatizaciones/[id]` (panel Resultados/Versiones/Ejecuciones). Servidor contra crm_pruebas: `node apps/crm/scripts/visual/run.mjs dev` (127.0.0.1:3101).
- D1 (OAuth Meta) ya está integrado aquí. Su copia sin commit sigue en `C:\dev\upzites` (release-hardening): descartarla allí solo con el OK del usuario. No tocar Harvey Control.
- Migraciones solo en crm_pruebas: cargar `.env.local` y correr `npm run test:db:deploy` (usa TEST_DATABASE_URL).
- Hito local P9: `NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts` (desde apps/crm).
- Hito local P10 (después del P9): mismo comando con `scripts/visual/p10-attribution-hito.ts`. Métricas por regla en `/canales/whatsapp/campanas`; el origen aparece en `/pedidos/[id]`.
- Decisión: el webhook de WhatsApp solo trae el id del anuncio; conjunto y campaña coinciden únicamente si llega esa atribución (Marketing API, no integrada).
- Siguiente: P13 plantillas (wizard sobre `generateQuickFlow` en `src/lib/automations/catalog.ts`; revisar qué tipos ya existen). Smoke base: cargar `.env.local` y correr `npx tsx scripts/smoke-meta-oauth.ts` (18 checks, Meta falso).
- Bloqueos externos: Meta Tech Provider + CTWA, buckets `deliverables`/`knowledge`, MP TEST, OpenAI real, Resend + dominio.
- Estado completo: `docs/MASTER_EXECUTION_STATUS.md`.

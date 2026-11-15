# Siguiente sesión

- Repo: `C:\dev\upzites-preview`, rama `feat/campaign-routing` (encima de P8 65eaad0). Sin push.
- No tocar `C:\dev\upzites` (release-hardening: OAuth Meta D1 sin commit) ni Harvey Control.
- Migraciones solo en crm_pruebas: cargar `.env.local` y correr `npm run test:db:deploy` (usa TEST_DATABASE_URL).
- Hito local P9: `NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts` (desde apps/crm).
- Decisión: el webhook de WhatsApp solo trae el id del anuncio; conjunto y campaña coinciden únicamente si llega esa atribución (Marketing API, no integrada).
- Siguiente: P10 CTWA (first touch en Contact, atribución en CustomerOrder, métricas por regla). Después, P11.
- Bloqueos externos: Meta Tech Provider + CTWA, buckets `deliverables`/`knowledge`, MP TEST, OpenAI real, Resend + dominio.
- Estado completo: `docs/MASTER_EXECUTION_STATUS.md`.

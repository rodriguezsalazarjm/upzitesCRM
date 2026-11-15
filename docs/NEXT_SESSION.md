# Siguiente sesión

- Repo: `C:\dev\upzites-preview`, rama `feat/ctwa-attribution` (P10, encima de P9 `feat/campaign-routing`). Sin push.
- No tocar `C:\dev\upzites` (release-hardening: OAuth Meta D1 sin commit) ni Harvey Control.
- Migraciones solo en crm_pruebas: cargar `.env.local` y correr `npm run test:db:deploy` (usa TEST_DATABASE_URL).
- Hito local P9: `NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts` (desde apps/crm).
- Hito local P10 (después del P9): mismo comando con `scripts/visual/p10-attribution-hito.ts`. Métricas por regla en `/canales/whatsapp/campanas`; el origen aparece en `/pedidos/[id]`.
- Decisión: el webhook de WhatsApp solo trae el id del anuncio; conjunto y campaña coinciden únicamente si llega esa atribución (Marketing API, no integrada).
- Siguiente: P11 Instagram estilo ManyChat (comentario con keyword → DM → IA → checkout). Revisar antes qué existe en `src/lib/instagram` y `src/lib/automations`; el OAuth D1 de `C:\dev\upzites` se integra con un procedimiento explícito, sin copiar a ciegas.
- Bloqueos externos: Meta Tech Provider + CTWA, buckets `deliverables`/`knowledge`, MP TEST, OpenAI real, Resend + dominio.
- Estado completo: `docs/MASTER_EXECUTION_STATUS.md`.

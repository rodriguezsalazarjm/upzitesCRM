# Upzites Flow — estado de ejecución del Plan Maestro V2

Fuente de verdad del alcance: `docs/UPZITES_FLOW_PLAN_MAESTRO_V2.txt`. Estados: CONCLUIDO, IMPLEMENTADO_SIN_VALIDAR, EN_CURSO, PENDIENTE, BLOQUEADO_EXTERNO.
CONCLUIDO = el hito está demostrado y las pruebas relevantes pasan. Ninguna rama tiene push y nada está desplegado.

| # | Bloque | Rama / commit | Estado | Evidencia real | Bloqueo | Siguiente paso |
|---|---|---|---|---|---|---|
| 0 | Núcleo SaaS | p0a…p0f (537fff4…f8c01e1) | CONCLUIDO | según el plan | — | — |
| 1 | Release readiness | feat/launch-readiness-5mcd 8966835 | CONCLUIDO | según el plan | — | — |
| 2 | Product Sales Studio | feat/product-sales-studio f2a98fb | IMPLEMENTADO_SIN_VALIDAR | storage real verificado (docs/p2) | — | hito con venta simulada en la cadena actual |
| 3 | Digital Asset Manager | feat/digital-asset-manager bb759ba | BLOQUEADO_EXTERNO | docs/p3 | bucket `deliverables` | crear bucket y probar entrega |
| 4 | IA ventas por producto | feat/product-sales-ai c9e02cb | BLOQUEADO_EXTERNO | ScriptedProvider | OpenAI real | smoke con proveedor real |
| 5 | Knowledge | feat/workspace-knowledge-base f1f0588 | BLOQUEADO_EXTERNO | test 22 + smoke 19 (02-11) | bucket `knowledge` | crear bucket |
| 6 | Bump / upsell | feat/offers-bump-upsell 01677e7 | BLOQUEADO_EXTERNO | MP en demo | MP TEST (P27) | — |
| 7 | Seguimiento | feat/commercial-followups 2054e9d | IMPLEMENTADO_SIN_VALIDAR | smoke reloj controlado | canales reales | — |
| 8 | WhatsApp Manager | feat/whatsapp-channel-manager 65eaad0 | BLOQUEADO_EXTERNO | tsc + test 30/30 (15-11); smoke 39/39 con mocks (02-11) | Tech Provider, META_APP_ID/SECRET, config Embedded Signup, número, webhook público | conectar número real |
| 9 | Campaign Routing | feat/campaign-routing 7e2b8f6+ | IMPLEMENTADO_SIN_VALIDAR | tsc limpio; 14 tests; `scripts/visual/p9-campaign-hito.ts` en crm_pruebas: 2 anuncios → 2 productos, sin referral → número | Meta solo envía ad id (no conjunto/campaña); CTWA real; <2 agentes publicados en QA | anuncios CTWA reales |
| 10 | CTWA / atribución | feat/campaign-routing | EN_CURSO | — | — | first touch + pedido + métricas |
| 11–13 | Instagram, Flow Builder, plantillas | — | PENDIENTE | — | Instagram: Meta App Review (trabajo D1 en C:\dev\upzites, sin integrar) | — |
| 14–18 | Experiencia | — | PENDIENTE (base existente) | — | — | — |
| 19–24 | Social | — | PENDIENTE | — | APIs Meta/TikTok | — |
| 37–38 | Quote Studio, Email Lite | — | PENDIENTE (hay cotizador previo) | — | OAuth Gmail/M365 para 38 | — |
| 25–29 | Integraciones reales | — | BLOQUEADO_EXTERNO | — | Resend + dominio, templates Meta, MP TEST, Instagram, TikTok | — |
| 30–31 | Analytics, excepciones | — | PENDIENTE | — | — | — |
| 32–34 | Negocios reales | — | PENDIENTE | — | contenido de 5MCD lo aporta el usuario | — |
| 35–36 | Producción | — | PENDIENTE | — | autorización explícita | — |

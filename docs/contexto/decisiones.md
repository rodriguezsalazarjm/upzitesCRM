# Decisiones de producto/ingeniería — CRM UPZITES

Registro de decisiones importantes tomadas en el desarrollo del CRM. Cada entrada: fecha, decisión, por qué, alternativas descartadas.

## 2026-06-30 — Auditoría inicial (Fase 0)

**Contexto:** antes de tocar código, se hizo una inspección completa del repo (`apps/crm`) siguiendo las reglas de trabajo establecidas (no inventar arquitectura nueva, no romper lo existente, todo cambio de DB vía migración versionada).

**Hallazgos clave (ver detalle en el reporte de la conversación; resumen aquí):**

- Stack confirmado: Next.js 16 + TS + Prisma 7 (`@prisma/adapter-pg`) + Supabase Postgres + Vercel. Coincide con lo esperado, no hace falta introducir nada nuevo.
- Multi-tenancy por `workspaceId` está bien aislado en todos los queries (`getCurrentWorkspaceId()`).
- CRUD real y funcional: Contactos, Oportunidades, Actividades (alta), Dashboard, Fuentes, Ops, captura web (snippet + forms).
- `Opportunity.ownerId` ya existe → el "responsable asignado" se modela ahí, no en `Contact`. `Contact` no tiene owner propio (decisión pendiente: ¿agregarlo, o el responsable siempre vive a nivel de oportunidad?).
- `Activity` con `dueAt`/`completedAt` ya cubre "próxima acción / seguimiento" — no hace falta un modelo `Task` nuevo.
- **Billing es 100% mock**: `POST /api/billing/checkout` activa la suscripción (`status: ACTIVE`) sin ningún cobro real ni verificación de pago — viola la regla "no simules que funciona". Pendiente de definir proveedor de pago (Mercado Pago es el candidato natural, ya está en `IntegrationProvider` enum) y planes (el usuario los definirá).
- Automatizaciones, Insights IA, Integraciones: solo lectura de datos reales de DB, **sin botones de acción falsos** (no hay CTAs muertos — verificado). No violan la regla 10 tal como están, pero tampoco dejan claro al usuario que son "solo vista".
- Botón "Registrar actividad" en `/actividades` es un link muerto (`href="#"`).
- `PATCH/DELETE` faltantes para `opportunities/[id]` y `activities/[id]` (solo GET/POST existen).
- Página `/configuracion`: campos de perfil de workspace son readonly con botón "Guardar cambios" deshabilitado — intencional (no hay edición de perfil implementada todavía), no es un bug sino una función no construida aún.
- Sin tests, sin CI/CD (`.github/workflows` no existe).

**Decisión:** no se modifica código en esta fase. Se reporta el hallazgo al usuario y se define el orden de fases junto con él antes de implementar (Mercado Pago vs Stripe, prioridad: gating de pago vs limpieza de UI fachada vs PATCH/DELETE faltantes).

## 2026-06-30 — Fase 1: Billing real con Mercado Pago + `Contact.ownerId`

**Decisiones de producto confirmadas con el usuario:**
- Registro nuevo → `SubscriptionStatus.TRIAL` por 7 días (antes: `ACTIVE` directo, sin pasar por pago). Reutiliza el estado `TRIAL`/`trialEndsAt` que ya existía en el schema sin usarse.
- Precio Fase 1: se mantiene el plan `monthly` ya sembrado ($49.000 CLP/mes). Planes por usuario quedan para una fase futura.
- Mercado Pago en modo TEST primero; producción después de validar el flujo completo.
- `Contact.ownerId` agregado (antes solo `Opportunity.ownerId` existía), mismo patrón exacto (`onDelete: SetNull`, relación nombrada).

**Decisiones técnicas (verificadas contra el código fuente real del SDK `mercadopago`, no solo documentación — ver `errores-conocidos.md` sobre la contradicción encontrada entre fuentes de documentación):**
- Validación de firma del webhook usa `WebhookSignatureValidator.validate()` del propio SDK (HMAC-SHA256, comparación en tiempo constante) en vez de reimplementar el manifest a mano.
- El checkout (`POST /api/billing/checkout`) **solo crea la Preference y devuelve la URL** — nunca activa la suscripción él mismo. La única fuente de verdad para "pago confirmado" es el webhook, que re-consulta el pago contra la API de Mercado Pago (nunca confía en el body de la notificación).
- Idempotencia del webhook vía `WorkspaceSubscription.mpPaymentId @unique` (constraint a nivel DB, no solo lógica de aplicación).
- No existía helper de verificación de roles en el repo — se agregó un check inline en el endpoint de checkout (`OWNER`/`ADMIN` únicamente), sin crear una abstracción nueva para un solo caso de uso.

**Migraciones ejecutadas** (versionadas, aditivas, sin DROP): `20260630220000_contact_owner`, `20260630220100_billing_mercadopago`.

**Compatibilidad:** el cambio en `createCustomerWorkspace` solo afecta registros nuevos. El workspace UPZITES (`rodriguezsalazarjm@gmail.com`), creado antes de este cambio, mantiene su `WorkspaceSubscription` en `ACTIVE` sin alteración.

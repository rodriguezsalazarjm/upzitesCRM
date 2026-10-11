import { NextResponse } from "next/server";
import { sendContactNotification, sendContactConfirmation } from "@/lib/resend";
import {
  EMAIL_RULES,
  IP_RULES,
  MAX_BODY_BYTES,
  consumeRateLimit,
  detectBotTrap,
  getClientIp,
  isFastSubmit,
  isForeignOrigin,
  validateContact,
  verifyTurnstile,
  type ContactPayload,
} from "@/lib/contact-security";

const SUCCESS_MESSAGE = "Solicitud recibida con exito.";

function getCrmBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? "").replace(/\/+$/, "");
}

async function forwardToCrm(payload: ContactPayload) {
  const crmBaseUrl = getCrmBaseUrl();
  const formPublicId = process.env.CRM_CAPTURE_FORM_PUBLIC_ID;

  if (!crmBaseUrl || !formPublicId) {
    return { synced: false, reason: "CRM capture env vars are not configured" };
  }

  const response = await fetch(`${crmBaseUrl}/api/capture/forms/${formPublicId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "CRM capture failed");
    throw new Error(message);
  }

  return { synced: true };
}

function reject(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, message }, { status, headers });
}

/** Log sin datos personales: solo el motivo, para ver el spam en los logs de Vercel. */
function logDiscard(reason: string) {
  console.info("contact_form_discarded", { reason });
}

export async function POST(request: Request) {
  if (isForeignOrigin(request)) {
    logDiscard("foreign_origin");
    return reject("Solicitud invalida", 403);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return reject("Solicitud invalida", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return reject("Solicitud invalida", 413);
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return reject("Solicitud invalida", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reject("Solicitud invalida", 400);
  }
  const input = body as Record<string, unknown>;

  // Bot de navegador: se le responde como si hubiera funcionado, para no
  // enseñarle qué lo delató. No se envía correo ni se crea lead.
  const trap = detectBotTrap(input);
  if (trap) {
    logDiscard(trap);
    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  }

  // Solo señal: el envío rápido sigue el flujo normal (ver isFastSubmit).
  if (isFastSubmit(input)) {
    console.info("contact_form_fast_submit");
  }

  const validation = validateContact(input);
  if (!validation.ok) {
    return reject(validation.message, 400);
  }
  const payload = validation.payload;

  const ip = getClientIp(request);
  const ipLimit = await consumeRateLimit("ip", ip, IP_RULES);
  if (!ipLimit.allowed) {
    logDiscard("rate_limit_ip");
    return reject(
      "Recibimos varias solicitudes seguidas. Espera unos minutos o escríbenos por WhatsApp.",
      429,
      { "Retry-After": String(ipLimit.retryAfterSeconds) },
    );
  }

  const turnstile = await verifyTurnstile(input.turnstileToken, ip);
  if (!turnstile.ok) {
    logDiscard(`turnstile:${turnstile.reason}`);
    return turnstile.unavailable
      ? reject("No pudimos verificar el envío. Inténtalo en unos minutos o escríbenos por WhatsApp.", 503)
      : reject("No pudimos verificar que no eres un robot. Recarga la página e inténtalo nuevamente.", 403);
  }

  // Después de Turnstile a propósito: así un bot sin token no puede agotar el
  // cupo de un email ajeno y bloquearle el contacto a esa persona.
  const emailLimit = await consumeRateLimit("email", payload.email, EMAIL_RULES);
  if (!emailLimit.allowed) {
    logDiscard("rate_limit_email");
    return reject(
      "Ya recibimos varias solicitudes desde este email hoy. Te responderemos pronto.",
      429,
      { "Retry-After": String(emailLimit.retryAfterSeconds) },
    );
  }

  await Promise.all([
    sendContactNotification(payload).catch((error) => {
      console.error("contact_form_email_error", error);
    }),
    sendContactConfirmation(payload).catch((error) => {
      console.error("contact_form_confirmation_error", error);
    }),
  ]);

  try {
    await forwardToCrm(payload);
    console.info("contact_form_accepted");
    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("contact_form_crm_error", error);
    return NextResponse.json({
      ok: true,
      message: "Solicitud recibida. Revisaremos el mensaje y te contactaremos pronto.",
    });
  }
}

import { Resend } from "resend";

const CONTACT_NOTIFICATION_TO = "contacto@upzites.com";
const FROM = "UPZITES <noreply@upzites.com>";

let client: Resend | null = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function row(label: string, value: string) {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;color:#8A8178;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#111;font-size:14px;">${escapeHtml(value)}</td></tr>`;
}

export async function sendContactNotification(payload: Record<string, string | boolean | null>) {
  const resend = getClient();
  if (!resend) {
    console.warn("resend_not_configured: RESEND_API_KEY missing, skipping contact notification email");
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const get = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  const name = get("name");
  const email = get("email");

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="font-size:18px;color:#111;margin:0 0 4px;">Nuevo mensaje de contacto</h2>
      <p style="font-size:13px;color:#8A8178;margin:0 0 18px;">Recibido desde el formulario de upzites.com</p>
      <table style="border-collapse:collapse;width:100%;">
        ${row("Nombre", name)}
        ${row("Email", email)}
        ${row("WhatsApp", get("whatsapp") || get("phone"))}
        ${row("Instagram", get("instagram"))}
        ${row("Empresa", get("company"))}
        ${row("Rubro", get("industry"))}
        ${row("Servicio", get("service"))}
        ${row("Presupuesto", get("budget"))}
        ${row("Urgencia", get("urgency"))}
        ${row("Página", get("pageUrl"))}
      </table>
      <div style="margin-top:18px;padding:14px 16px;background:#FFF8F0;border-radius:10px;">
        <p style="font-size:13px;color:#8A8178;margin:0 0 6px;">Mensaje</p>
        <p style="font-size:14px;color:#111;white-space:pre-wrap;margin:0;">${escapeHtml(get("message"))}</p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: CONTACT_NOTIFICATION_TO,
      replyTo: email || undefined,
      subject: `Nuevo contacto: ${name || "Sin nombre"}`,
      html,
    });
    if (result.error) throw new Error(result.error.message);
    return { sent: true, id: result.data?.id };
  } catch (error) {
    console.error("resend_send_error", error);
    return { sent: false, reason: "send_failed" };
  }
}

export async function sendContactConfirmation(payload: Record<string, string | boolean | null>) {
  const resend = getClient();
  if (!resend) {
    console.warn("resend_not_configured: RESEND_API_KEY missing, skipping confirmation email");
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const get = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  const name = get("name");
  const email = get("email");
  if (!email) return { sent: false, reason: "no recipient email" };

  const firstName = name.trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#111;">
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8178;margin:0 0 18px;">UPZITES</p>
      <h2 style="font-size:19px;margin:0 0 14px;">${greeting}</h2>
      <p style="font-size:14.5px;line-height:1.6;margin:0 0 12px;">
        Gracias por ponerte en contacto con nosotros. Ya recibimos tu mensaje y
        en breve una persona de nuestro equipo se pondrá en contacto contigo
        para conversar sobre tu proyecto.
      </p>
      <p style="font-size:14.5px;line-height:1.6;margin:0 0 22px;">
        Si necesitas algo urgente mientras tanto, puedes escribirnos directamente
        a <a href="mailto:contacto@upzites.com" style="color:#111;">contacto@upzites.com</a>
        o por WhatsApp.
      </p>
      <p style="font-size:13px;color:#8A8178;margin:0;">— El equipo de UPZITES</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Recibimos tu mensaje · UPZITES",
      html,
    });
    if (result.error) throw new Error(result.error.message);
    return { sent: true, id: result.data?.id };
  } catch (error) {
    console.error("resend_confirmation_error", error);
    return { sent: false, reason: "send_failed" };
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const form = await prisma.form.findUnique({
    where: { publicId },
    include: { workspace: true },
  });

  if (!form || !form.isActive) {
    return new NextResponse('Formulario no disponible', { status: 404 });
  }

  const { origin } = new URL(request.url);
  const action = `${origin}/api/capture/forms/${form.publicId}/submit`;
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#0f172a}
      form{display:grid;gap:12px;padding:18px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
      h1{font-size:18px;margin:0 0 2px;font-weight:750}
      p{font-size:13px;line-height:1.4;color:#64748b;margin:0 0 6px}
      label{display:grid;gap:5px;font-size:12px;font-weight:650;color:#475569}
      input,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;font-size:13px}
      textarea{min-height:84px;resize:vertical}
      button{border:0;border-radius:8px;background:#2563eb;color:white;font-weight:700;font-size:13px;padding:11px;cursor:pointer}
      .fine{font-size:11px;color:#94a3b8;text-align:center}
    </style>
  </head>
  <body>
    <form method="post" action="${action}">
      <input type="hidden" name="pageUrl" value="" />
      <input type="hidden" name="referrer" value="" />
      <input type="hidden" name="utmSource" value="" />
      <input type="hidden" name="utmMedium" value="" />
      <input type="hidden" name="utmCampaign" value="" />
      <h1>${escapeHtml(form.title)}</h1>
      ${form.description ? `<p>${escapeHtml(form.description)}</p>` : ''}
      <label>Nombre<input name="name" autocomplete="name" required /></label>
      <label>Email<input name="email" type="email" autocomplete="email" required /></label>
      <label>Telefono<input name="phone" autocomplete="tel" /></label>
      <label>Empresa<input name="company" autocomplete="organization" /></label>
      <label>Mensaje<textarea name="message"></textarea></label>
      <button type="submit">${escapeHtml(form.submitLabel)}</button>
      <div class="fine">Conectado a ${escapeHtml(form.workspace.name)}</div>
    </form>
    <script>
      var params = new URLSearchParams(window.location.search);
      document.querySelector('[name=pageUrl]').value = params.get('pageUrl') || document.referrer || '';
      document.querySelector('[name=referrer]').value = document.referrer || '';
      document.querySelector('[name=utmSource]').value = params.get('utm_source') || '';
      document.querySelector('[name=utmMedium]').value = params.get('utm_medium') || '';
      document.querySelector('[name=utmCampaign]').value = params.get('utm_campaign') || '';
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

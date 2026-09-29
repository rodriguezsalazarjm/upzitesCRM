'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Experiencia del workspace (P0-E):
 *  - Aplicar la navegacion recomendada (OWNER/ADMIN), separado de guardar el
 *    tipo de negocio: cambiar el perfil no pisa el menu ni el inicio de nadie.
 *  - Volver a mostrar consejos (cualquiera; solo afecta a quien lo pulsa).
 */
export function ExperiencePanel({
  currentLabel,
  recommendedLabel,
  recommendationDiffers,
  updateAvailable,
  applied,
  canApply,
}: {
  currentLabel: string;
  recommendedLabel: string;
  recommendationDiffers: boolean;
  updateAvailable: boolean;
  applied: boolean;
  canApply: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'apply' | 'tips' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function apply() {
    setBusy('apply');
    setNotice(null);
    const response = await fetch('/api/workspace/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetMyLayout: true }),
    });
    setBusy(null);
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    setNotice(response.ok ? 'Listo: aplicamos la navegación recomendada.' : (json.message ?? 'No pudimos aplicar la configuración.'));
    if (response.ok) router.refresh();
  }

  async function resetTips() {
    setBusy('tips');
    setNotice(null);
    const response = await fetch('/api/preferences/tutorials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    setBusy(null);
    setNotice(response.ok ? 'Los consejos volverán a aparecer.' : 'No pudimos restablecer los consejos.');
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-ivory p-4">
        <p className="text-sm text-graphite">
          Configuración actual: <strong className="text-carbon">{currentLabel}</strong>
          {!applied && ' (deducida de tu tipo de negocio)'}
        </p>
        {recommendationDiffers && (
          <p className="mt-1 text-sm text-graphite">
            Para tu tipo de negocio recomendamos <strong className="text-carbon">{recommendedLabel}</strong>. Tu menú e inicio no cambian hasta
            que la apliques.
          </p>
        )}
        {!recommendationDiffers && updateAvailable && (
          <p className="mt-1 text-sm text-graphite">Hay una nueva configuración recomendada para tu tipo de negocio.</p>
        )}
        {canApply && (recommendationDiffers || updateAvailable || !applied) && (
          <Button type="button" className="mt-3" disabled={busy !== null} onClick={() => void apply()}>
            {busy === 'apply' ? 'Aplicando…' : 'Aplicar navegación recomendada para este tipo de negocio'}
          </Button>
        )}
        {canApply && (
          <p className="mt-2 text-xs text-soft">Aplicarla ordena el menú y el inicio recomendados para ti. Las preferencias del resto del equipo no cambian.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void resetTips()}>
          {busy === 'tips' ? 'Restableciendo…' : 'Volver a mostrar consejos'}
        </Button>
        {notice && (
          <p role="status" className="text-sm text-soft">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

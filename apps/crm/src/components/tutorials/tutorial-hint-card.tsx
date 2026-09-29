'use client';

import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TutorialHintCard({ tutorialKey, title, body, className }: { tutorialKey: string; title: string; body: string; className?: string }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  async function dismiss() {
    setVisible(false);
    await fetch('/api/preferences/tutorials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismiss: tutorialKey }),
    }).catch(() => undefined);
  }
  return (
    <div role="note" data-tutorial={tutorialKey} className={cn('flex items-start gap-3 rounded-xl border border-electric/30 bg-electric/[0.06] p-4', className)}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-electric" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-carbon">{title}</p>
        <p className="mt-0.5 text-sm text-graphite">{body}</p>
      </div>
      <button type="button" onClick={() => void dismiss()} className="rounded p-1 text-soft hover:text-carbon" aria-label="Entendido, no volver a mostrar">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

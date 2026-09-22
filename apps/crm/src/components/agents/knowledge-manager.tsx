'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { ToggleRow } from '@/components/ui/toggle-row';
import { cn } from '@/lib/utils';

type Source = { id?: string; type: string; title: string; content: string; isActive: boolean };
const empty: Source = { type: 'TEXT', title: '', content: '', isActive: true };

const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Información del negocio',
  FAQ: 'FAQ',
  POLICY: 'Política',
};

export function KnowledgeManager({ sources, canManage }: { sources: Source[]; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(empty);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(remove = false) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/knowledge${remove ? `?id=${draft.id}` : ''}`, {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: remove ? undefined : JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setDraft(empty);
      setMessage('Conocimiento actualizado.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2.5">
        {sources.map((s) => {
          const active = s.id === draft.id;
          return (
            <button
              key={s.id}
              onClick={() => setDraft(s)}
              className={cn(
                'block w-full rounded-xl border p-4 text-left transition-colors',
                active ? 'border-electric bg-electric/[0.05]' : 'border-line bg-paper hover:border-mist',
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <StatusBadge tone="neutral">{TYPE_LABEL[s.type] ?? s.type}</StatusBadge>
                <StatusBadge tone={s.isActive ? 'success' : 'draft'}>{s.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
              </div>
              <h3 className="text-sm font-bold text-carbon">{s.title}</h3>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-soft">{s.content}</p>
            </button>
          );
        })}
        {!sources.length && (
          <EmptyState
            icon={BookOpen}
            title="Sin fuentes de conocimiento"
            description="Añade información del negocio, preguntas frecuentes y políticas para que el agente pueda consultarlas."
          />
        )}
      </div>

      <Card className="p-5">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 className="text-base font-bold text-carbon">{draft.id ? 'Editar fuente' : 'Nueva fuente'}</h2>
          <FormField label="Tipo" htmlFor="knowledge-type">
            <Select disabled={!canManage} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="TEXT">Información del negocio</option>
              <option value="FAQ">FAQ: pregunta + respuesta</option>
              <option value="POLICY">Política</option>
            </Select>
          </FormField>
          <FormField label={draft.type === 'FAQ' ? 'Pregunta' : 'Título'} htmlFor="knowledge-title">
            <Input required disabled={!canManage} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </FormField>
          <FormField label={draft.type === 'FAQ' ? 'Respuesta' : 'Información estructurada'} htmlFor="knowledge-content">
            <Textarea
              required
              disabled={!canManage}
              rows={9}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Pagos, entrega, garantía, cambios, horarios y cobertura…"
            />
          </FormField>
          <ToggleRow
            id="knowledge-active"
            label="Disponible para el agente"
            checked={draft.isActive}
            onCheckedChange={(value) => setDraft({ ...draft, isActive: value })}
            disabled={!canManage}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || !canManage}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Guardar
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(empty)}>
              <Plus aria-hidden />
              Nueva
            </Button>
            {draft.id && canManage && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger-ink hover:bg-tomato/12"
                disabled={busy}
                onClick={() => save(true)}
              >
                <Trash2 aria-hidden />
                Eliminar
              </Button>
            )}
          </div>
          {message && (
            <p role="status" className="text-sm text-soft">
              {message}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}

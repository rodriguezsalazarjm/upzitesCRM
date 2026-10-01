'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Copy, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StudioProductStatus } from '@/lib/commerce/product-studio/rules';

/**
 * Enlace de compra del producto. Solo existe con el producto publicado: un
 * borrador no finge tener un checkout operativo.
 */
export function CheckoutLinkCard({ productId, status, checkoutUrl }: { productId: string; status: StudioProductStatus; checkoutUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <SettingsCard
      title="Checkout"
      description="Comparte este enlace: el comprador elige la opción, deja sus datos y paga en el checkout seguro."
      actions={
        status === 'ACTIVE' ? <StatusBadge tone="success">Publicado</StatusBadge> : status === 'ARCHIVED' ? <StatusBadge tone="neutral">Archivado</StatusBadge> : <StatusBadge tone="draft">Sin publicar</StatusBadge>
      }
    >
      {checkoutUrl ? (
        <div className="space-y-3">
          <FormField label="Enlace de compra" htmlFor={`checkout-url-${productId}`}>
            <Input readOnly value={checkoutUrl} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Ver checkout
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/productos/${encodeURIComponent(productId)}/vista-previa`}>
                <Eye aria-hidden />
                Vista previa
              </Link>
            </Button>
          </div>
          <p role="status" className="text-xs text-soft">
            {copyError ? 'Tu navegador no permitió copiar. Selecciona el enlace y cópialo manualmente.' : copied ? 'Copiado al portapapeles.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-soft">
          <p>{status === 'ARCHIVED' ? 'El producto está archivado y no acepta nuevas ventas.' : 'Publica el producto para obtener su enlace de compra. Mientras sea borrador, nadie puede comprarlo.'}</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/productos/${encodeURIComponent(productId)}/vista-previa`}>
              <Eye aria-hidden />
              Vista previa del checkout
            </Link>
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

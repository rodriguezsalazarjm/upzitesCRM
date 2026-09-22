import * as React from 'react';
import { cn } from '@/lib/utils';

/** Label de campo. Reutilizable suelto (legend, fila de checkbox) o dentro de FormField. */
export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-semibold text-carbon', className)} {...props} />;
}

/** Texto de ayuda bajo un label o legend. */
export function FormDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-xs leading-5 text-soft', className)} {...props} />;
}

/** Error de campo o de formulario. role=alert: se anuncia solo al aparecer. */
export function FormError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      className={cn('mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-ink', className)}
      {...props}
    />
  );
}

/**
 * Campo con label + control + descripción/error. El control (Input/Select/
 * Textarea/…) se pasa como children; FormField le inyecta `id` y
 * `aria-describedby` para que la ayuda y el error queden asociados.
 */
export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  labelClassName,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  description?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  const descId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <FormLabel htmlFor={htmlFor} className={labelClassName}>
        {label}
        {required && (
          <span className="ml-0.5 text-tomato" aria-hidden>
            *
          </span>
        )}
      </FormLabel>
      {description && (
        <FormDescription id={descId} className="mt-0">
          {description}
        </FormDescription>
      )}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : children}
      {error && <FormError id={errorId}>{error}</FormError>}
    </div>
  );
}

/**
 * Agrupa varios campos relacionados dentro de un mismo formulario (un
 * fieldset visual, sin card ni borde): título opcional, descripción breve y
 * el aire vertical del resto del sistema. Para una sección de página entera
 * con su propia superficie, usar `SettingsCard`.
 */
export function FormSection({
  legend,
  description,
  className,
  children,
}: {
  legend?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      {legend && (
        <div>
          <legend className="text-sm font-semibold text-carbon">{legend}</legend>
          {description && <FormDescription>{description}</FormDescription>}
        </div>
      )}
      {children}
    </fieldset>
  );
}

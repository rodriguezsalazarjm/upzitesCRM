'use client';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// Explicit htmlFor/id: a wrapping <label> would fold the control's live value into its
// accessible name (per the accname spec's "embedded control" rule), breaking getByLabel
// and misreporting a moving target to screen readers.
export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/** Campo de texto genérico del Builder: mismo FormField/Input/Textarea del resto del sistema. */
export function FlowField({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const id = `field-${slugify(label)}`;
  return (
    <FormField label={label} htmlFor={id}>
      {multiline ? (
        <Textarea disabled={disabled} rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </FormField>
  );
}

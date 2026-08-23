import type { ReactNode, FormEvent } from 'react';
import { X } from 'lucide-react';
import { classNames } from '../lib/format';

interface Props {
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  wide?: boolean;
}

export default function RecordFormModal({
  title,
  submitLabel,
  onClose,
  onSubmit,
  children,
  wide,
}: Props) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close form"
        className="fixed inset-0 z-[60] bg-ink/30"
        onClick={onClose}
      />
      <div
        className={classNames(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full bg-surface border border-rule rounded-sm shadow-elevated fade-in max-h-[90vh] flex flex-col',
          wide ? 'max-w-2xl' : 'max-w-lg'
        )}
      >
        <div className="px-5 py-4 border-b border-rule flex items-center gap-3 shrink-0">
          <div className="font-display font-semibold text-[15px] flex-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-sm text-gray-400 hover:text-ink hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
          <div className="px-5 py-3 border-t border-rule flex items-center justify-end gap-2 bg-gray-50 shrink-0">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export function FormField({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}
        {required ? ' *' : ''}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function textInput(className?: string) {
  return classNames('input w-full py-1.5 text-[13px]', className);
}

export function textArea(className?: string) {
  return classNames('input w-full py-1.5 text-[13px] min-h-[72px] resize-y', className);
}

export function selectInput(className?: string) {
  return classNames('select w-full py-1.5 text-[13px]', className);
}

export function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

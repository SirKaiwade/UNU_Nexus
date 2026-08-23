import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, Copy, Search } from 'lucide-react';
import { classNames } from '../lib/format';
import type { Freshness } from '../types';

export function FreshnessLabel({ freshness }: { freshness: Freshness }) {
  const cls =
    freshness === 'Current'
      ? 'chip-green'
      : freshness === 'Possibly outdated'
        ? 'chip-amber'
        : 'chip-gray';
  const dot =
    freshness === 'Current'
      ? 'bg-accent-green'
      : freshness === 'Possibly outdated'
        ? 'bg-accent-gold'
        : 'bg-gray-400';
  return (
    <span className={`chip ${cls}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {freshness}
    </span>
  );
}

export function ConfidenceIndicator({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const label = pct >= 85 ? 'High confidence' : pct >= 65 ? 'Moderate confidence' : 'Low confidence';
  const color = pct >= 85 ? 'bg-accent-green' : pct >= 65 ? 'bg-un-blue' : 'bg-accent-gold';
  return (
    <div className="text-caption">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-500 font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="meter">
        <span className={color} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Avatar({
  initials,
  color = '#006EB6',
  size = 'md',
}: {
  initials: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'xs'
      ? 'w-5 h-5 text-[9px]'
      : size === 'sm'
        ? 'w-7 h-7 text-[11px]'
        : size === 'lg'
          ? 'w-12 h-12 text-[15px]'
          : 'w-9 h-9 text-[12px]';
  return (
    <div
      className={classNames(
        'rounded-full flex items-center justify-center text-white font-semibold shrink-0',
        dim
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/** Page chrome used by every module — consistent hierarchy without cloning markup. */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  search,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  search?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-icon" aria-hidden="true">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="page-header-copy min-w-0 flex-1">
        <h1 className="page-header-title truncate">{title}</h1>
        {subtitle && <p className="page-header-sub truncate">{subtitle}</p>}
      </div>
      {search}
      {actions && <div className="page-header-actions shrink-0">{actions}</div>}
    </header>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  compact = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={classNames('relative w-full max-w-xs', className)}>
      <Search
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
        strokeWidth={1.75}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className={classNames(
          'input input-search w-full',
          compact ? 'py-1.5 text-body-s' : 'text-body-m'
        )}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state-icon" aria-hidden="true">
        <Icon className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames('filter-chip', active && 'filter-chip-active')}
    >
      {children}
      {count !== undefined && <span className="filter-chip-count">{count}</span>}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  iconOnly = false,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  iconOnly?: boolean;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={classNames('segmented-btn', value === opt.value && 'segmented-btn-active')}
            title={opt.label}
          >
            {Icon ? <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> : null}
            {iconOnly ? (
              <span className="sr-only">{opt.label}</span>
            ) : (
              <span>{opt.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Quiet inline summary — replaces KPI card strips. */
export function MetaSummary({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="meta-summary">
      {items.map((item, i) => (
        <span key={item.label} className="meta-summary-item">
          {i > 0 && <span className="meta-summary-sep" aria-hidden="true" />}
          <span className="meta-summary-value tabular-nums">{item.value}</span>
          <span className="meta-summary-label">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export function NexusMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="nexus-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src="/nexus/logo.svg" alt="" width={size} height={size} draggable={false} />
    </div>
  );
}

export function ThinkingBar({ label = 'Searching internal sources…' }: { label?: string }) {
  return (
    <div className="thinking" role="status" aria-live="polite">
      <div className="thinking-track" aria-hidden="true">
        <div className="thinking-bar" />
      </div>
      <span className="thinking-label">{label}</span>
    </div>
  );
}

/** One-click copy for emails, phones, and other reference values. */
export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!value || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      className={classNames(
        'inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-un-blue hover:bg-un-blue-bg transition-colors',
        copied && 'text-accent-green hover:text-accent-green'
      )}
    >
      {copied ? (
        <Check className="w-3 h-3" strokeWidth={2} />
      ) : (
        <Copy className="w-3 h-3" strokeWidth={1.75} />
      )}
    </button>
  );
}

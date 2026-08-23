interface Props {
  /** Width of the UN emblem in pixels. */
  emblemSize?: number;
  /** Show "Nexus" wordmark beside the emblem. */
  showName?: boolean;
  /** Optional line under the wordmark (e.g. "UNU Global Health"). */
  org?: string;
  /** White emblem for dark backgrounds; blue for light. */
  variant?: 'light' | 'dark';
  className?: string;
  nameClassName?: string;
  orgClassName?: string;
}

export default function BrandMark({
  emblemSize = 40,
  showName = true,
  org,
  variant = 'dark',
  className = '',
  nameClassName = '',
  orgClassName = '',
}: Props) {
  const emblemClass =
    variant === 'light' ? 'brand-emblem brand-emblem-light' : 'brand-emblem';

  return (
    <div className={`brand-mark ${className}`.trim()}>
      <img
        src="/un/emblem.svg"
        alt="United Nations"
        width={emblemSize}
        height={Math.round(emblemSize * (400 / 470))}
        className={emblemClass}
        draggable={false}
      />
      {showName && (
        <div className="brand-text">
          <span className={`brand-name ${nameClassName}`.trim()}>Nexus</span>
          {org ? (
            <span className={`brand-org ${orgClassName}`.trim()}>{org}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Ditó mark: an "o" ring (echoing the horizon gate) with its acute accent. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="dito-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFA24D" />
          <stop offset="0.5" stopColor="#FF6A00" />
          <stop offset="1" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="19" r="8" fill="none" stroke="url(#dito-mark)" strokeWidth="3" />
      <path d="M17.6 7.6 22 3.2" stroke="url(#dito-mark)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

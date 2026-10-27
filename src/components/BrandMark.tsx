import React, { useId } from 'react';

/**
 * SwarmCanvas mark: three honeycomb cells. The honey cell is the lit/active one, the blue-teal cell
 * holds a generated image, the outlined cell is the empty slot waiting for the next one.
 * Geometry matches the application icon (public/swarmcanvas.svg and src-tauri/icons).
 * While `busy` the cells pulse one after another, like a swarm working.
 */
const CELL_A = 'M331.9,204.0 L479.1,289.0 L479.1,459.0 L331.9,544.0 L184.6,459.0 L184.6,289.0 Z';
const CELL_B = 'M692.1,204.0 L839.4,289.0 L839.4,459.0 L692.1,544.0 L544.9,459.0 L544.9,289.0 Z';
const CELL_C = 'M512.0,516.0 L659.2,601.0 L659.2,771.0 L512.0,856.0 L364.8,771.0 L364.8,601.0 Z';

export const BrandMark: React.FC<{ size?: number; busy?: boolean; className?: string; title?: string }> = ({
  size = 28,
  busy = false,
  className = '',
  title,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={`sc-brand-mark shrink-0 ${className}`}
      data-busy={busy ? 'true' : 'false'}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-tile`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#222833" /><stop offset="1" stopColor="#0c0e12" /></linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.28" cy="0.18" r="0.75"><stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${uid}-honey`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd978" /><stop offset="1" stopColor="#f09a22" /></linearGradient>
        <linearGradient id={`${uid}-image`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3fe3c6" /><stop offset="1" stopColor="#3d8bff" /></linearGradient>
      </defs>
      <rect x="32" y="32" width="960" height="960" rx="228" fill={`url(#${uid}-tile)`} />
      <rect x="32" y="32" width="960" height="960" rx="228" fill={`url(#${uid}-glow)`} />
      <rect x="35" y="35" width="954" height="954" rx="225" fill="none" stroke="#fff" strokeOpacity=".09" strokeWidth="6" />
      <g strokeLinejoin="round" strokeWidth="46">
        <path className="sc-cell sc-cell-a" d={CELL_A} fill={`url(#${uid}-honey)`} stroke={`url(#${uid}-honey)`} />
        <path className="sc-cell sc-cell-b" d={CELL_B} fill={`url(#${uid}-image)`} stroke={`url(#${uid}-image)`} />
        <path className="sc-cell sc-cell-c" d={CELL_C} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.66)" strokeWidth="30" />
      </g>
    </svg>
  );
};

/** Mark plus wordmark for the top bar. */
export const BrandLockup: React.FC<{ busy?: boolean; suffix?: string }> = ({ busy = false, suffix }) => (
  <span className="sc-brand-lockup inline-flex items-center gap-2 min-w-0">
    <BrandMark size={26} busy={busy} />
    <span className="sc-brand-name truncate">SwarmCanvas</span>
    {suffix ? <span className="sc-brand-suffix">{suffix}</span> : null}
  </span>
);

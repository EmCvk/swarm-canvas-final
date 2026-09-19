import * as React from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface Props {
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

type Position = { left: number; top: number; transform?: string };

const GAP = 8;
const WIDTH = 270;
const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPosition(anchor: DOMRect, side: NonNullable<Props['side']>): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const heightEstimate = 84;
  const options: Array<{ side: Exclude<NonNullable<Props['side']>, 'auto'>; fits: boolean; pos: Position }> = [
    {
      side: 'top',
      fits: anchor.top >= heightEstimate + GAP,
      pos: { left: anchor.right - WIDTH, top: anchor.top - GAP, transform: 'translateY(-100%)' },
    },
    {
      side: 'bottom',
      fits: anchor.bottom + heightEstimate + GAP <= viewportHeight,
      pos: { left: anchor.right - WIDTH, top: anchor.bottom + GAP },
    },
    {
      side: 'left',
      fits: anchor.left >= WIDTH + GAP,
      pos: { left: anchor.left - GAP, top: anchor.top + anchor.height / 2, transform: 'translate(-100%, -50%)' },
    },
    {
      side: 'right',
      fits: anchor.right + WIDTH + GAP <= viewportWidth,
      pos: { left: anchor.right + GAP, top: anchor.top + anchor.height / 2, transform: 'translateY(-50%)' },
    },
  ];

  const requested = side === 'auto' ? null : options.find((option) => option.side === side) || null;
  const chosen = requested?.fits ? requested : (options.find((option) => option.fits) || requested || options[1]);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - WIDTH - VIEWPORT_MARGIN);
  const left = chosen.side === 'left' || chosen.side === 'right'
    ? chosen.pos.left
    : clamp(chosen.pos.left, VIEWPORT_MARGIN, maxLeft);
  const top = clamp(chosen.pos.top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - heightEstimate - VIEWPORT_MARGIN));

  return { ...chosen.pos, left, top };
}

/** Small, accessible information popover. When children are supplied, they become the trigger itself. */
export const InfoPopover: React.FC<Props> = ({ content, side = 'auto', className = '', children, disabled = false }) => {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position | null>(null);

  const updatePosition = React.useCallback(() => {
    if (!anchorRef.current) return;
    setPosition(getPosition(anchorRef.current.getBoundingClientRect(), side));
  }, [side]);

  React.useEffect(() => {
    if (!open) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };
    sync();
    window.addEventListener('resize', sync, { passive: true });
    window.addEventListener('scroll', sync, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open, updatePosition]);

  if (disabled) return <>{children || null}</>;

  const openPopover = () => {
    setOpen(true);
    requestAnimationFrame(updatePosition);
  };
  const closePopover = () => setOpen(false);

  const trigger = children || (
    <span className="sc-info-popover-icon-wrap" aria-hidden="true">
      <Info className="sc-info-popover-icon" />
    </span>
  );

  return (
    <span
      ref={anchorRef}
      className={`sc-info-popover ${children ? 'sc-info-popover-trigger' : ''} ${className}`}
      tabIndex={children ? -1 : 0}
      role={children ? undefined : 'note'}
      aria-label={children ? undefined : content}
      onMouseEnter={openPopover}
      onMouseLeave={closePopover}
      onFocus={openPopover}
      onBlur={closePopover}
      onPointerDown={(event) => {
        if (children && event.pointerType !== 'mouse') {
          setOpen((current) => !current);
        }
      }}
    >
      {trigger}
      {open && position && createPortal(
        <span
          className="sc-info-popover-card sc-info-popover-portal"
          style={{ left: position.left, top: position.top, transform: position.transform }}
          role="tooltip"
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
};

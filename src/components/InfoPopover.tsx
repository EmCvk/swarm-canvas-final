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

function getPosition(anchor: DOMRect, side: NonNullable<Props['side']>, estimatedHeight: number): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const options: Array<{ side: Exclude<NonNullable<Props['side']>, 'auto'>; fits: boolean; pos: Position }> = [
    {
      side: 'top',
      fits: anchor.top >= estimatedHeight + GAP,
      pos: { left: anchor.right - WIDTH, top: anchor.top - GAP, transform: 'translateY(-100%)' },
    },
    {
      side: 'bottom',
      fits: anchor.bottom + estimatedHeight + GAP <= viewportHeight,
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

  // Each side's `top` means something different once its transform is applied, so it must be
  // clamped against the viewport edge it can actually violate - clamping every side against the
  // same "non-flipped box" formula pushed 'top'-side tooltips further from their anchor than
  // intended without ever fixing the case it was meant for.
  let top: number;
  if (chosen.side === 'top') {
    // Box occupies [top - height, top]; only the upper edge can go off-screen.
    top = Math.max(chosen.pos.top, estimatedHeight + VIEWPORT_MARGIN);
  } else if (chosen.side === 'bottom') {
    // Box occupies [top, top + height]; only the lower edge can go off-screen.
    top = Math.min(chosen.pos.top, Math.max(VIEWPORT_MARGIN, viewportHeight - estimatedHeight - VIEWPORT_MARGIN));
  } else {
    // 'left' / 'right': box is vertically centered on `top`; either edge can go off-screen.
    top = clamp(chosen.pos.top, estimatedHeight / 2 + VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - estimatedHeight / 2 - VIEWPORT_MARGIN));
  }

  return { ...chosen.pos, left, top };
}

/** Rough height estimate for a content string at this card's fixed width, used only to decide
 *  which side has room and to clamp the fallback position - never to size the box itself. */
function estimateContentHeight(content: string): number {
  const charsPerLine = 34;
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine));
  return Math.min(260, lines * 19 + 18);
}

/** Small, accessible information popover. When children are supplied, they become the trigger itself. */
export const InfoPopover: React.FC<Props> = ({ content, side = 'auto', className = '', children, disabled = false }) => {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position | null>(null);

  const updatePosition = React.useCallback(() => {
    if (!anchorRef.current) return;
    setPosition(getPosition(anchorRef.current.getBoundingClientRect(), side, estimateContentHeight(content)));
  }, [side, content]);

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

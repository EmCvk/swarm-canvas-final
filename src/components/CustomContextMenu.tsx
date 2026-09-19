// src/components/CustomContextMenu.tsx
import * as React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { InfoPopover } from './InfoPopover';

const fallbackContextInfo = (label: string): string | undefined => {
  const value = label.toLowerCase();
  if (value.includes('reload') || value.includes('refresh')) return 'Refreshes the related data or metadata without deleting your generation files.';
  if (value.includes('apply')) return 'Applies this item to the active generation parameters or prompt target.';
  if (value.includes('insert')) return 'Inserts the item into the currently active prompt field.';
  if (value.includes('copy')) return 'Copies the selected value to the clipboard for reuse elsewhere.';
  if (value.includes('favorite')) return 'Marks this item as a favorite so it can be found quickly later.';
  if (value.includes('pin')) return 'Pins this item so it stays easy to locate in the asset browser.';
  if (value.includes('edit')) return 'Opens the item for editing without immediately starting a generation.';
  if (value.includes('duplicate')) return 'Creates a separate queued copy with the same generation settings.';
  if (value.includes('variation')) return 'Creates another queued generation from this job with a changed seed.';
  if (value.includes('remove') || value.includes('delete') || value.includes('clear')) return 'Removes the selected item or clears the selected state. This does not delete source model files unless explicitly stated.';
  if (value.includes('open')) return 'Opens the related panel, page or external resource.';
  if (value.includes('set ')) return 'Stores this value for the selected asset or workspace setting.';
  return undefined;
};

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
  info?: string;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
  onClose: () => void;
}

export const CustomContextMenu: React.FC<Props> = ({ x, y, items, title, onClose }) => {
  useEffect(() => {
    const handleClose = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuWidth = 256;
  const menuHeightEstimate = Math.max(64, items.length * 36 + (title ? 38 : 10));
  const menuX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const menuY = Math.max(8, Math.min(y, window.innerHeight - menuHeightEstimate - 8));

  return createPortal(
    <div
      style={{ left: `${menuX}px`, top: `${menuY}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-999999 w-64 sc-context-menu select-none backdrop-blur-xl font-sans"
    >
      {title && (
        <div className="px-3 py-1.5 font-mono text-[10px] text-zinc-300 border-b border-white/10 flex items-center justify-between">
          <span className="truncate">{title}</span>
        </div>
      )}

      {items.map((item, idx) => {
        const info = item.info || fallbackContextInfo(item.label);
        return (
        <React.Fragment key={idx}>
          {item.separator && <div className="h-px bg-[#262b3a] my-1" />}
          <button
            onClick={() => {
              item.action();
              onClose();
            }}
            className={`sc-context-menu-item w-full px-3 py-2 flex items-center justify-between transition cursor-pointer text-left ${
              item.danger ? 'is-danger' : ''
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {item.icon}
              <span className="truncate">{item.label}</span>
            </span>
            {info && (
              <InfoPopover content={info} side="left" className="sc-context-help-trigger">
                <span
                  className="sc-context-info"
                  tabIndex={0}
                  aria-label={info}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span aria-hidden="true">i</span>
                </span>
              </InfoPopover>
            )}
          </button>
        </React.Fragment>
        );
      })}
    </div>,
    document.body
  );
};
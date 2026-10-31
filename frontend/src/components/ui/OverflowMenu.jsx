import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

/**
 * Compact three-dot menu for secondary / destructive actions.
 * Panel is portaled + fixed so overflow:hidden parents cannot clip it.
 * Closes on outside click, Escape, or item select.
 */
export default function OverflowMenu({
  label = "More actions",
  align = "right",
  items = [],
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const menuId = useId();
  const visibleItems = items.filter(Boolean);

  const updatePosition = () => {
    const trigger = rootRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel?.offsetWidth || 184;
    const panelHeight = panel?.offsetHeight || 8 + visibleItems.length * 36;
    const gap = 6;
    const margin = 8;
    let left =
      align === "left" ? rect.left : rect.right - panelWidth;
    left = Math.min(
      Math.max(margin, left),
      window.innerWidth - panelWidth - margin
    );
    let top = rect.bottom + gap;
    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - gap - panelHeight);
    }
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- position when open/items change
  }, [open, align, visibleItems.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const inTrigger = rootRef.current?.contains(event.target);
      const inPanel = panelRef.current?.contains(event.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!visibleItems.length) return null;

  return (
    <div className={`qc-overflow-menu ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="qc-overflow-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            id={menuId}
            ref={panelRef}
            role="menu"
            className="qc-overflow-panel qc-overflow-panel--fixed"
            style={{ top: coords.top, left: coords.left }}
          >
            {visibleItems.map((item) => (
              <button
                key={item.id || item.label}
                type="button"
                role="menuitem"
                className={`qc-overflow-item ${item.danger ? "is-danger" : ""} ${item.disabled ? "is-disabled" : ""}`}
                disabled={Boolean(item.disabled)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.disabled) return;
                  setOpen(false);
                  // Defer confirm/dialogs until after the portaled menu unmounts
                  // (sync window.confirm here made Archive look unreliable).
                  const select = item.onSelect;
                  if (typeof select === "function") {
                    window.setTimeout(() => select(), 0);
                  }
                }}
              >
                {item.icon ? (
                  <span className="qc-overflow-item__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

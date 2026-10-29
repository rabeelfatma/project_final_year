import React, { useEffect, useId, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

/**
 * Compact three-dot menu for secondary / destructive actions.
 * Touch-friendly: opens on click/tap; closes on outside click, Escape, or item select.
 */
export default function OverflowMenu({
  label = "More actions",
  align = "right",
  items = [],
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const visibleItems = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
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
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`qc-overflow-panel ${align === "left" ? "is-left" : "is-right"}`}
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
                item.onSelect?.();
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
        </div>
      )}
    </div>
  );
}

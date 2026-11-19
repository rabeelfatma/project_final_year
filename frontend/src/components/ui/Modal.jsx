import React, { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Shared modal shell used by dashboard confirmations and management dialogs.
 */
export default function Modal({
  open,
  title,
  children,
  onClose,
  wide = false,
  footer = null,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="qc-modal-backdrop qc-modal-backdrop--elevated"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`qc-modal ${wide ? "qc-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {(title || onClose) && (
          <div className="qc-modal__header">
            {title ? (
              <h3 id={titleId} className="qc-modal__title">
                {title}
              </h3>
            ) : (
              <span />
            )}
            {onClose ? (
              <button
                type="button"
                className="qc-icon-btn"
                onClick={onClose}
                aria-label="Close dialog"
                title="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}
        <div className="qc-modal__body">{children}</div>
        {footer ? <div className="qc-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

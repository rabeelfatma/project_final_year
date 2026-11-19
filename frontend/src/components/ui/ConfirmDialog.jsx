import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

/**
 * Professional confirmation dialog for destructive / important actions.
 * Replaces browser window.confirm while preserving cancel/confirm semantics.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="qc-modal-backdrop qc-modal-backdrop--elevated"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        className="qc-modal qc-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className={`qc-confirm-dialog__icon ${danger ? "is-danger" : ""}`} aria-hidden="true">
          <AlertTriangle size={20} />
        </div>
        <h3 id={titleId} className="qc-confirm-dialog__title">
          {title}
        </h3>
        {description ? (
          <p id={descriptionId} className="qc-confirm-dialog__description">
            {description}
          </p>
        ) : (
          <span id={descriptionId} className="sr-only">
            Confirm this action
          </span>
        )}
        {detail ? <p className="qc-confirm-dialog__detail">{detail}</p> : null}
        <div className="qc-confirm-dialog__actions">
          <button
            type="button"
            className="qc-btn qc-btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`qc-btn ${danger ? "qc-btn-danger" : "qc-btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

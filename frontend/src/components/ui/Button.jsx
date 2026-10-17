export default function Button({
  text,
  type = "submit",
  onClick,
  disabled = false,
  variant = "primary",
  className = "",
}) {
  const variantClass =
    variant === "secondary"
      ? "qc-btn-secondary"
      : variant === "danger"
        ? "qc-btn-danger"
        : "qc-btn-primary";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`qc-btn qc-btn-block ${variantClass} ${className}`.trim()}
    >
      {text}
    </button>
  );
}

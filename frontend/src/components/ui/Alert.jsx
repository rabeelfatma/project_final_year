export default function Alert({ message }) {
  if (!message) return null;

  const text = String(message);
  const isError =
    text.includes("❌") ||
    /fail|invalid|error|denied|required|unavailable|unable|mismatch|declined/i.test(
      text
    );

  return (
    <div
      role="alert"
      className={`qc-alert mb-2.5 px-2.5 py-1.5 text-xs font-medium border rounded-qc leading-snug ${
        isError
          ? "qc-alert--error text-[var(--danger)] bg-[var(--danger-bg)] border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]"
          : "qc-alert--info text-[var(--accent)] bg-[var(--accent-bg)] border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]"
      }`}
    >
      {text.replace(/^❌\s*/, "")}
    </div>
  );
}

export default function Alert({ message }) {
  if (!message) return null;

  const text = String(message);
  const isError =
    text.includes("❌") ||
    /fail|invalid|error|denied|required|unavailable|unable/i.test(text);

  return (
    <div
      role="alert"
      className={`mb-4 px-3 py-2.5 text-sm font-medium border rounded-qc ${
        isError
          ? "text-[var(--danger)] bg-[var(--danger-bg)] border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]"
          : "text-[var(--accent)] bg-[var(--accent-bg)] border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]"
      }`}
    >
      {text.replace(/^❌\s*/, "")}
    </div>
  );
}

export default function Alert({ message }) {
  const isError = message.includes("❌");
  return (
    <div className={`mb-3 p-2 text-sm font-medium border rounded transition-all duration-300 animate-bounce-short ${
      isError 
      ? "text-[var(--error)] bg-[var(--error-bg)] border-[var(--error)]" 
      : "text-[var(--accent)] bg-[var(--accent-bg)] border-[var(--accent)]"
    }`}>
      {message}
    </div>
  );
}
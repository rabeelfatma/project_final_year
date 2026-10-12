export default function Button({ text, type = "submit", onClick, disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-sky-500 hover:bg-sky-600 active:scale-95 transition-all text-white p-2 rounded font-bold shadow-lg shadow-sky-500/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
    >
      {text}
    </button>
  );
}
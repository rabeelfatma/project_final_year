export default function Button({ text, type = "submit", onClick }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="w-full bg-sky-500 hover:bg-sky-600 active:scale-95 transition-all text-white p-2 rounded font-bold shadow-lg shadow-sky-500/20"
    >
      {text}
    </button>
  );
}
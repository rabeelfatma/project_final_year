export default function InputField({
  name,
  type = "text",
  placeholder,
  value,
  onChange,
}) {
  return (
    <input
      name={name}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className="w-full p-2 mb-3 bg-[var(--input-bg)] text-[var(--text)] border border-[var(--border)] rounded
                 focus:border-sky-400 focus:ring-2 focus:ring-sky-400 outline-none placeholder:text-[var(--text-faint)]"
    />
  );
}
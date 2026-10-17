export default function InputField({
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  id,
  disabled = false,
  autoComplete,
}) {
  return (
    <input
      id={id || name}
      name={name}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      autoComplete={autoComplete}
      className="qc-field"
    />
  );
}

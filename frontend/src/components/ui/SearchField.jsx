import React from "react";
import { Search, X } from "lucide-react";

/**
 * Single outlined search control: icon + input + optional clear.
 * Outer .qc-search-field owns the border; the inner input stays borderless.
 */
export default function SearchField({
  value = "",
  onChange,
  placeholder = "Search…",
  label = "Search",
  className = "",
  inputClassName = "",
}) {
  return (
    <label className={`qc-search-field ${className}`.trim()}>
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={inputClassName || undefined}
        autoComplete="off"
      />
      {String(value).length > 0 ? (
        <button
          type="button"
          className="qc-search-clear"
          aria-label="Clear search"
          title="Clear search"
          onClick={(event) => {
            event.preventDefault();
            onChange?.("");
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}

import type { SelectHTMLAttributes } from "react";

interface C64SelectOption {
  value: string;
  label: string;
}

interface C64SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "style"> {
  options: C64SelectOption[];
  label?: string;
}

export function C64Select({
  options,
  label,
  className = "",
  ...props
}: C64SelectProps) {
  return (
    <div className="inline-block">
      {label && <label className="block mb-[1em]">{label}</label>}
      <select
        className={`c64-control cursor-pointer appearance-none ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

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
        className={`bg-c64-6-blue text-c64-14-light-blue border-none outline-none font-['C64_Pro_Mono',monospace] text-[16px] leading-[1] tracking-[0] p-[0.5em_1em] cursor-pointer focus:bg-c64-14-light-blue focus:text-c64-6-blue appearance-none ${className}`}
        style={{ borderRadius: 0, boxShadow: "none" }}
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

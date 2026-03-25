import type { InputHTMLAttributes } from "react";

interface C64InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  label?: string;
}

export function C64Input({ label, className = "", ...props }: C64InputProps) {
  return (
    <div className="inline-block">
      {label && <label className="block mb-[1em]">{label}</label>}
      <input className={`c64-control ${className}`} {...props} />
    </div>
  );
}

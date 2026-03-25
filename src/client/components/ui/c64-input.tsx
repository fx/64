import { type InputHTMLAttributes, useState } from "react";

interface C64InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  label?: string;
}

export function C64Input({ label, className = "", ...props }: C64InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="inline-block">
      {label && <label className="block mb-[1em]">{label}</label>}
      <input
        className={`bg-c64-6-blue text-c64-14-light-blue border-none outline-none font-['C64_Pro_Mono',monospace] text-[16px] leading-[1] tracking-[0] p-[0.5em_1em] ${focused ? "bg-c64-14-light-blue text-c64-6-blue" : ""} ${className}`}
        style={{ caretColor: "transparent", borderRadius: 0, boxShadow: "none" }}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {focused && (
        <span className="animate-c64-cursor">_</span>
      )}
    </div>
  );
}

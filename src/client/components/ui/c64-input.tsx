import { useId, type InputHTMLAttributes } from "react";

interface C64InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  label?: string;
}

export function C64Input({
  label,
  className = "",
  id,
  ...props
}: C64InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="inline-block">
      {label && (
        <label className="block mb-[1em]" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`c64-control ${className}`} {...props} />
    </div>
  );
}

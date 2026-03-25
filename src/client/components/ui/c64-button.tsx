import type { ButtonHTMLAttributes } from "react";

interface C64ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger";
}

export function C64Button({
  variant = "default",
  type = "button",
  className = "",
  children,
  ...props
}: C64ButtonProps) {
  const variantClass =
    variant === "danger"
      ? "bg-c64-2-red text-c64-1-white hover:bg-c64-10-light-red"
      : "";

  return (
    <button
      type={type}
      className={`c64-button ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

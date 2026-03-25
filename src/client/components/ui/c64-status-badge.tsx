interface C64StatusBadgeProps {
  online: boolean;
}

export function C64StatusBadge({ online }: C64StatusBadgeProps) {
  return (
    <span className={online ? "text-c64-5-green" : "text-c64-2-red"}>
      {"\u2588"} {online ? "ON" : "OFF"}
    </span>
  );
}

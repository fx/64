import type { ReactNode } from "react";
import { PETSCII_BOX } from "../../lib/petscii.ts";

interface C64BoxProps {
  title?: string;
  children: ReactNode;
  width?: number;
}

export function C64Box({ title, children, width = 40 }: C64BoxProps) {
  const innerWidth = width - 2;
  const h = PETSCII_BOX.horizontal;
  const v = PETSCII_BOX.vertical;

  const topBar = title
    ? `${h} ${title.toUpperCase().slice(0, innerWidth - 4)} ${h.repeat(Math.max(0, innerWidth - title.length - 3))}`
    : h.repeat(innerWidth);

  const topLine = `${PETSCII_BOX.topLeft}${topBar}${PETSCII_BOX.topRight}`;
  const bottomLine = `${PETSCII_BOX.bottomLeft}${h.repeat(innerWidth)}${PETSCII_BOX.bottomRight}`;

  return (
    <div className="c64-box-border">
      <div>{topLine}</div>
      <div>
        {typeof children === "string" ? (
          <div>
            {v}
            <span>{` ${children}`.padEnd(innerWidth)}</span>
            {v}
          </div>
        ) : (
          <div className="c64-box-content">
            <BoxContent v={v}>
              {children}
            </BoxContent>
          </div>
        )}
      </div>
      <div>{bottomLine}</div>
    </div>
  );
}

function BoxContent({
  v,
  children,
}: {
  v: string;
  children: ReactNode;
}) {
  return (
    <div className="inline-block">
      <div className="flex">
        <span>{v}</span>
        <div className="flex-1 px-[1ch]">{children}</div>
        <span>{v}</span>
      </div>
    </div>
  );
}

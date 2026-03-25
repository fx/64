import type { ReactNode } from "react";
import { PETSCII_BOX } from "../../lib/petscii.ts";

interface C64TableColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: number;
}

interface C64TableProps<T> {
  columns: C64TableColumn<T>[];
  data: T[];
  keyFn: (row: T) => string;
  emptyMessage?: string;
}

export function C64Table<T>({
  columns,
  data,
  keyFn,
  emptyMessage = "NO DATA",
  width = 40,
}: C64TableProps<T> & { width?: number }) {
  const h = PETSCII_BOX.horizontal;

  return (
    <div className="c64-box-border">
      {/* Header row */}
      <div className="flex bg-c64-14-light-blue text-c64-6-blue">
        {columns.map((col, i) => (
          <span
            key={i}
            className="px-[1ch] py-[0.25em] flex-1"
            style={col.width ? { flex: `0 0 ${col.width}ch` } : undefined}
          >
            {col.header}
          </span>
        ))}
      </div>
      {/* Separator */}
      <div>{h.repeat(width)}</div>
      {/* Data rows */}
      {data.length === 0 ? (
        <div className="px-[1ch] py-[0.5em]">{emptyMessage}</div>
      ) : (
        data.map((row) => (
          <div key={keyFn(row)} className="flex items-center">
            {columns.map((col, i) => (
              <span
                key={i}
                className="px-[1ch] py-[0.25em] flex-1"
                style={col.width ? { flex: `0 0 ${col.width}ch` } : undefined}
              >
                {typeof col.accessor === "function"
                  ? col.accessor(row)
                  : String(row[col.accessor] ?? "")}
              </span>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

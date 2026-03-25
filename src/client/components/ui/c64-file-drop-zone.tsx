import {
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
  useRef,
  useState,
  useCallback,
} from "react";
import { PETSCII_BOX } from "../../lib/petscii.ts";

const DEFAULT_EXTENSIONS = [".d64", ".d71", ".d81", ".g64", ".g71"];

const INNER_WIDTH = 30;

function pad(text: string, width: number) {
  return text + " ".repeat(Math.max(0, width - text.length));
}

interface C64FileDropZoneProps {
  onFile: (file: File) => void;
  accept?: string[];
  disabled?: boolean;
}

export function C64FileDropZone({
  onFile,
  accept = DEFAULT_EXTENSIONS,
  disabled,
}: C64FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const h = PETSCII_BOX.horizontal;
  const v = PETSCII_BOX.vertical;

  const validateFile = useCallback(
    (file: File): boolean => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      return accept.includes(ext);
    },
    [accept],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file && validateFile(file)) onFile(file);
    },
    [disabled, onFile, validateFile],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && validateFile(file)) onFile(file);
    },
    [onFile, validateFile],
  );

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`c64-box-border ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${!disabled && dragOver ? "bg-c64-14-light-blue text-c64-6-blue" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        if (disabled) return;
        setDragOver(false);
      }}
      onDrop={handleDrop}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
    >
      <div>
        {PETSCII_BOX.topLeft}
        {h.repeat(INNER_WIDTH)}
        {PETSCII_BOX.topRight}
      </div>
      <div>
        {v}
        {pad(" DROP DISK IMAGE HERE", INNER_WIDTH)}
        {v}
      </div>
      <div>
        {v}
        {pad(" OR CLICK TO BROWSE", INNER_WIDTH)}
        {v}
      </div>
      <div>
        {v}
        {pad(" " + accept.join(" "), INNER_WIDTH)}
        {v}
      </div>
      <div>
        {PETSCII_BOX.bottomLeft}
        {h.repeat(INNER_WIDTH)}
        {PETSCII_BOX.bottomRight}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept.join(",")}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}

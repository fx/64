import { useLibrary } from "../../hooks/use-local-games.ts";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";

interface LocalFilePickerProps {
  onSelect: (filename: string) => void;
  onClose: () => void;
}

export function LocalFilePicker({ onSelect, onClose }: LocalFilePickerProps) {
  const { data: files, isLoading, error } = useLibrary();

  return (
    <C64Box title="LIBRARY">
      <div className="flex flex-col gap-[0.25em]">
        {isLoading && (
          <p className="text-c64-15-light-grey">LOADING...</p>
        )}
        {error && (
          <p className="text-c64-2-red">
            ERROR: {error instanceof Error ? error.message.toUpperCase() : "UNKNOWN"}
          </p>
        )}
        {files && files.length === 0 && (
          <p className="text-c64-15-light-grey">NO FILES IN DATA/LIBRARY/</p>
        )}
        {files && files.length > 0 && (
          <div className="flex flex-col">
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                className="text-left px-[1ch] py-0 text-c64-14-light-blue hover:bg-c64-14-light-blue hover:text-c64-6-blue focus:bg-c64-14-light-blue focus:text-c64-6-blue cursor-pointer"
                onClick={() => onSelect(file.name)}
              >
                {file.name.toUpperCase()} ({Math.ceil(file.size / 1024)}K)
              </button>
            ))}
          </div>
        )}
        <div className="mt-[0.25em]">
          <C64Button onClick={onClose}>CLOSE</C64Button>
        </div>
      </div>
    </C64Box>
  );
}

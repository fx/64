import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import type { C64UDriveInfo } from "@shared/c64u-types.ts";

interface DriveStatusPanelProps {
  drives: Array<Record<string, C64UDriveInfo>>;
  onRemoveDisk: (drive: string) => void;
  isRemoving: boolean;
}

function DrivePanel({
  letter,
  info,
  onRemove,
  isRemoving,
}: {
  letter: string;
  info: C64UDriveInfo;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const hasImage = !!info.image_file;

  return (
    <C64Box title={`DRIVE ${letter.toUpperCase()}`}>
      <div className="flex flex-col gap-[0.25em]">
        <div>
          STATUS: {info.enabled ? "ENABLED" : "DISABLED"}
        </div>
        <div>TYPE: {info.type}</div>
        <div>BUS ID: {info.bus_id}</div>
        <div>
          IMAGE: {hasImage ? info.image_file : "NO DISK"}
        </div>
        {info.image_path && (
          <div>PATH: {info.image_path}</div>
        )}
        {info.last_error && (
          <div className="text-c64-2-red">ERROR: {info.last_error}</div>
        )}
        {hasImage && (
          <div className="mt-[0.25em]">
            <C64Button
              variant="danger"
              onClick={onRemove}
              disabled={isRemoving}
            >
              {isRemoving ? "REMOVING..." : "REMOVE DISK"}
            </C64Button>
          </div>
        )}
      </div>
    </C64Box>
  );
}

export function DriveStatusPanel({
  drives,
  onRemoveDisk,
  isRemoving,
}: DriveStatusPanelProps) {
  return (
    <div className="flex flex-col gap-[1em]">
      {drives.map((driveRecord) => {
        const entries = Object.entries(driveRecord);
        return entries.map(([letter, info]) => (
          <DrivePanel
            key={letter}
            letter={letter}
            info={info}
            onRemove={() => onRemoveDisk(letter)}
            isRemoving={isRemoving}
          />
        ));
      })}
    </div>
  );
}

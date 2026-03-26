import { useState } from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { C64Select } from "../ui/c64-select.tsx";
import { useCollections, useFlipDisk } from "../../hooks/use-collections.ts";
import { useToast } from "../ui/toast-context.tsx";

interface FlipWidgetProps {
  deviceId: string;
}

export function FlipWidget({ deviceId }: FlipWidgetProps) {
  const { data: collections, isLoading } = useCollections();
  const flipMutation = useFlipDisk();
  const { addToast } = useToast();

  const [selectedId, setSelectedId] = useState("");
  const [currentSlot, setCurrentSlot] = useState(0);

  const selected = collections?.find((c) => c.id === selectedId);
  const totalDisks = selected?.disks.length ?? 0;
  // Clamp currentSlot to valid range in case collection was edited externally
  const clampedSlot = totalDisks > 0 ? Math.min(currentSlot, totalDisks - 1) : 0;
  const currentDisk = selected?.disks[clampedSlot];

  const handleFlip = (direction?: "prev", slot?: number) => {
    if (!selectedId) return;

    flipMutation.mutate(
      { id: selectedId, deviceId, direction, slot },
      {
        onSuccess: (data) => {
          if ("position" in data && "disk" in data) {
            setCurrentSlot(data.position as number);
            const disk = data.disk as { label: string };
            addToast(`MOUNTED: ${disk.label}`, "success");
          }
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  if (isLoading) {
    return (
      <C64Box title="DISK FLIP">
        <p>
          <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
        </p>
      </C64Box>
    );
  }

  if (!collections || collections.length === 0) {
    return (
      <C64Box title="DISK FLIP">
        <p>NO COLLECTIONS AVAILABLE</p>
      </C64Box>
    );
  }

  return (
    <C64Box title="DISK FLIP">
      <div className="flex flex-col gap-[0.5em]">
        {/* Collection selector */}
        <C64Select
          options={[
            { value: "", label: "-- SELECT COLLECTION --" },
            ...collections.map((c) => ({
              value: c.id,
              label: `${c.name.toUpperCase()} (${c.disks.length} DISKS)`,
            })),
          ]}
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setCurrentSlot(0);
          }}
        />

        {/* Current disk info + controls */}
        {selected && totalDisks > 0 && (
          <>
            <div className="bg-c64-11-dark-grey px-[1ch] py-[0.25em]">
              <div>
                DISK {clampedSlot + 1}/{totalDisks}
              </div>
              <div>{currentDisk?.label.toUpperCase() ?? "UNKNOWN"}</div>
              <div>
                DRIVE: {currentDisk?.drive.toUpperCase() ?? "?"} | PATH:{" "}
                {currentDisk?.path.split("/").pop()?.toUpperCase() ?? "?"}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-[1ch]">
              <C64Button
                onClick={() => handleFlip("prev")}
                disabled={flipMutation.isPending}
              >
                {"\u25C0"} PREV
              </C64Button>
              <C64Button
                onClick={() => handleFlip()}
                disabled={flipMutation.isPending}
              >
                NEXT {"\u25B6"}
              </C64Button>
            </div>

            {/* Direct slot buttons (show if <= 8 disks) */}
            {totalDisks <= 8 && (
              <div className="flex gap-[1ch] flex-wrap">
                {selected.disks.map((_, i) => (
                  <C64Button
                    key={i}
                    onClick={() => handleFlip(undefined, i)}
                    disabled={flipMutation.isPending}
                    className={i === clampedSlot ? "c64-reverse" : ""}
                  >
                    {i + 1}
                  </C64Button>
                ))}
              </div>
            )}

            {flipMutation.isPending && (
              <p>
                <span className="animate-c64-cursor">{"\u2588"}</span>{" "}
                MOUNTING...
              </p>
            )}
          </>
        )}

        {selected && totalDisks === 0 && (
          <p>COLLECTION HAS NO DISKS</p>
        )}
      </div>
    </C64Box>
  );
}

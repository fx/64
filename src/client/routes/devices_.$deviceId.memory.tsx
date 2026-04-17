import { useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { C64Box } from "../components/ui/c64-box.tsx";
import { C64Button } from "../components/ui/c64-button.tsx";
import { HexViewer } from "../components/dev/hex-viewer.tsx";
import { DisassemblyPanel } from "../components/dev/disassembly-panel.tsx";
import { ScreenViewer } from "../components/dev/screen-viewer.tsx";
import { useMemoryRead, useMemoryWrite } from "../hooks/use-memory.ts";
import { useDevice } from "../hooks/use-device-info.ts";
import { useToast } from "../components/ui/toast-context.tsx";

export const Route = createFileRoute("/devices_/$deviceId/memory")({
  component: MemoryBrowserPage,
});

type ViewMode = "hex" | "disasm" | "split" | "screen";

function MemoryBrowserPage() {
  const { deviceId } = Route.useParams();
  const device = useDevice(deviceId);
  const { addToast } = useToast();

  const [baseAddress, setBaseAddress] = useState(0x0000);
  const [readLength, setReadLength] = useState(4096);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [scrollOffset, setScrollOffset] = useState(0);

  const memory = useMemoryRead(deviceId, baseAddress, readLength);
  const writeMem = useMemoryWrite(deviceId);

  const handleByteEdit = useCallback(
    (address: number, value: number) => {
      const addrHex = address.toString(16).toUpperCase().padStart(4, "0");
      const dataHex = value.toString(16).toUpperCase().padStart(2, "0");
      writeMem.mutate(
        { address: addrHex, data: dataHex },
        {
          onSuccess: () => addToast(`WROTE $${dataHex} TO $${addrHex}`, "success"),
          onError: (err) => addToast(`WRITE FAILED: ${err.message}`, "error"),
        },
      );
    },
    [writeMem, addToast],
  );

  const handleLoadRange = useCallback(
    (addr: number, len: number) => {
      setBaseAddress(addr);
      setReadLength(len);
      setScrollOffset(0);
    },
    [],
  );

  const presetRanges = [
    { label: "ZERO PAGE", addr: 0x0000, len: 256 },
    { label: "SCREEN + COLOR RAM", addr: 0x0400, len: 0xD7E8 },
    { label: "BASIC ROM", addr: 0xA000, len: 0x2000 },
    { label: "KERNAL ROM", addr: 0xE000, len: 0x2000 },
    { label: "FULL 64K", addr: 0x0000, len: 0x10000 },
    { label: "SID", addr: 0xD400, len: 0x0020 },
    { label: "VIC-II", addr: 0xD000, len: 0x0040 },
    { label: "CIA 1", addr: 0xDC00, len: 0x0010 },
  ];

  return (
    <div className="p-[1em]">
      {/* Navigation */}
      <div className="mb-[1em] flex gap-[2ch]">
        <Link to="/" className="c64-button inline-block no-underline">
          &lt; DEVICES
        </Link>
        <Link
          to="/devices/$deviceId"
          params={{ deviceId }}
          className="c64-button inline-block no-underline"
        >
          &lt; DASHBOARD
        </Link>
      </div>

      {/* Title */}
      <C64Box title={`MEMORY BROWSER - ${device.data?.name?.toUpperCase() || deviceId}`}>
        <div className="flex flex-col gap-[0.5em]">
          {/* Preset ranges */}
          <div className="flex flex-wrap gap-[1ch]">
            {presetRanges.map((p) => (
              <button
                key={p.label}
                className="c64-button p-[0.25em_0.5em]"
                onClick={() => handleLoadRange(p.addr, p.len)}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="flex items-center gap-[1ch]">
            <span className="text-c64-15-light-grey">RANGE:</span>
            <span>${baseAddress.toString(16).toUpperCase().padStart(4, "0")}</span>
            <span>-</span>
            <span>
              $
              {Math.min(baseAddress + readLength - 1, 0xFFFF)
                .toString(16)
                .toUpperCase()
                .padStart(4, "0")}
            </span>
            <span className="text-c64-11-dark-grey">
              ({readLength} BYTES)
            </span>
            <C64Button
              onClick={() => memory.refetch()}
              disabled={memory.isFetching}
              className="p-[0.25em_0.5em]"
            >
              {memory.isFetching ? "READING..." : "REFRESH"}
            </C64Button>
          </div>

          {/* View mode selector */}
          <div className="flex gap-[1ch]">
            <span className="text-c64-15-light-grey">VIEW:</span>
            {(["hex", "disasm", "split", "screen"] as const).map((mode) => (
              <button
                key={mode}
                className={`p-[0.25em_0.5em] ${
                  viewMode === mode
                    ? "bg-c64-14-light-blue text-c64-6-blue"
                    : "c64-button"
                }`}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </C64Box>

      {/* Error display */}
      {memory.isError && (
        <div className="mt-[1em]">
          <C64Box title="ERROR">
            <p className="text-c64-2-red">
              {memory.error?.message || "FAILED TO READ MEMORY"}
            </p>
          </C64Box>
        </div>
      )}

      {/* Content area */}
      <div className="mt-[1em]">
        {viewMode === "hex" && (
          <C64Box title="HEX VIEW" width={78}>
            <HexViewer
              data={memory.data}
              baseAddress={baseAddress}
              onByteEdit={handleByteEdit}
              scrollOffset={scrollOffset}
              onScrollOffset={setScrollOffset}
            />
          </C64Box>
        )}

        {viewMode === "disasm" && (
          <C64Box title="DISASSEMBLY" width={40}>
            <DisassemblyPanel
              data={memory.data}
              baseAddress={baseAddress}
              scrollOffset={scrollOffset}
              onScrollOffset={setScrollOffset}
            />
          </C64Box>
        )}

        {viewMode === "split" && (
          <div className="flex gap-[1ch]">
            <div className="flex-1">
              <C64Box title="HEX VIEW" width={58}>
                <HexViewer
                  data={memory.data}
                  baseAddress={baseAddress}
                  onByteEdit={handleByteEdit}
                  scrollOffset={scrollOffset}
                  onScrollOffset={setScrollOffset}
                />
              </C64Box>
            </div>
            <div className="flex-1">
              <C64Box title="DISASSEMBLY" width={36}>
                <DisassemblyPanel
                  data={memory.data}
                  baseAddress={baseAddress}
                  scrollOffset={scrollOffset}
                  onScrollOffset={setScrollOffset}
                />
              </C64Box>
            </div>
          </div>
        )}

        {viewMode === "screen" && (
          <C64Box title="SCREEN VIEWER ($0400)" width={44}>
            <ScreenViewer data={memory.data} baseAddress={baseAddress} />
          </C64Box>
        )}
      </div>

      {/* Write status */}
      {writeMem.isPending && (
        <div className="mt-[1em] text-c64-7-yellow">
          <span className="animate-c64-cursor">{"\u2588"}</span> WRITING...
        </div>
      )}
    </div>
  );
}

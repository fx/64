import { useState, useCallback } from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { C64Input } from "../ui/c64-input.tsx";
import { C64Select } from "../ui/c64-select.tsx";
import { C64FileBrowser } from "../device/file-browser.tsx";
import type { MacroStep, Macro } from "@shared/types.ts";

const ACTION_OPTIONS = [
  { value: "reset", label: "RESET" },
  { value: "reboot", label: "REBOOT" },
  { value: "pause", label: "PAUSE" },
  { value: "resume", label: "RESUME" },
  { value: "mount", label: "MOUNT DISK" },
  { value: "remove", label: "REMOVE DISK" },
  { value: "run_prg", label: "RUN PRG" },
  { value: "load_prg", label: "LOAD PRG" },
  { value: "run_crt", label: "RUN CRT" },
  { value: "sidplay", label: "SID PLAY" },
  { value: "modplay", label: "MOD PLAY" },
  { value: "writemem", label: "WRITE MEM" },
  { value: "set_config", label: "SET CONFIG" },
  { value: "delay", label: "DELAY" },
];

const DRIVE_OPTIONS = [
  { value: "a", label: "DRIVE A" },
  { value: "b", label: "DRIVE B" },
];

function makeDefaultStep(action: string): MacroStep {
  switch (action) {
    case "mount":
      return { action: "mount", drive: "a", image: "" };
    case "remove":
      return { action: "remove", drive: "a" };
    case "run_prg":
      return { action: "run_prg", file: "" };
    case "load_prg":
      return { action: "load_prg", file: "" };
    case "run_crt":
      return { action: "run_crt", file: "" };
    case "sidplay":
      return { action: "sidplay", file: "" };
    case "modplay":
      return { action: "modplay", file: "" };
    case "writemem":
      return { action: "writemem", address: "0400", data: "00" };
    case "set_config":
      return { action: "set_config", category: "", item: "", value: "" };
    case "delay":
      return { action: "delay", ms: 1000 };
    default:
      return { action: action as "reset" };
  }
}

function stepDescription(step: MacroStep): string {
  switch (step.action) {
    case "mount":
      return `MOUNT ${step.image || "?"} → ${step.drive.toUpperCase()}`;
    case "remove":
      return `REMOVE ${step.drive.toUpperCase()}`;
    case "run_prg":
    case "load_prg":
    case "run_crt":
    case "modplay":
      return `${step.action.toUpperCase()} ${step.file || "?"}`;
    case "sidplay":
      return `SIDPLAY ${step.file || "?"}${step.songnr !== undefined ? ` #${step.songnr}` : ""}`;
    case "writemem":
      return `WRITEMEM $${step.address} = ${step.data}`;
    case "set_config":
      return `CONFIG ${step.category}/${step.item}=${step.value}`;
    case "delay":
      return `DELAY ${step.ms}MS`;
    default:
      return step.action.toUpperCase();
  }
}

interface StepFieldsProps {
  step: MacroStep;
  onChange: (step: MacroStep) => void;
  deviceId?: string;
}

function StepFields({ step, onChange, deviceId }: StepFieldsProps) {
  const [showBrowser, setShowBrowser] = useState(false);

  const handleFileSelect = useCallback(
    (path: string) => {
      if ("file" in step) {
        onChange({ ...step, file: path } as MacroStep);
      } else if ("image" in step) {
        onChange({ ...step, image: path } as MacroStep);
      }
      setShowBrowser(false);
    },
    [step, onChange],
  );

  switch (step.action) {
    case "reset":
    case "reboot":
    case "pause":
    case "resume":
      return null;

    case "mount":
      return (
        <div className="flex flex-col gap-[0.25em]">
          <C64Select
            options={DRIVE_OPTIONS}
            value={step.drive}
            onChange={(e) => onChange({ ...step, drive: e.target.value as "a" | "b" })}
          />
          <div className="flex gap-[1ch] items-end">
            <C64Input
              placeholder="IMAGE PATH"
              value={step.image}
              onChange={(e) => onChange({ ...step, image: e.target.value })}
              className="flex-1"
            />
            {deviceId && (
              <C64Button onClick={() => setShowBrowser(true)}>BROWSE</C64Button>
            )}
          </div>
          <C64Input
            placeholder="MODE (OPTIONAL)"
            value={step.mode || ""}
            onChange={(e) => onChange({ ...step, mode: e.target.value || undefined })}
          />
          {showBrowser && deviceId && (
            <div className="mt-[0.5em]">
              <C64FileBrowser
                deviceId={deviceId}
                onSelectDisk={handleFileSelect}
                onClose={() => setShowBrowser(false)}
              />
            </div>
          )}
        </div>
      );

    case "remove":
      return (
        <C64Select
          options={DRIVE_OPTIONS}
          value={step.drive}
          onChange={(e) => onChange({ ...step, drive: e.target.value as "a" | "b" })}
        />
      );

    case "run_prg":
    case "load_prg":
    case "run_crt":
    case "modplay":
      return (
        <div className="flex flex-col gap-[0.25em]">
          <div className="flex gap-[1ch] items-end">
            <C64Input
              placeholder="FILE PATH"
              value={step.file}
              onChange={(e) => onChange({ ...step, file: e.target.value } as MacroStep)}
              className="flex-1"
            />
            {deviceId && (
              <C64Button onClick={() => setShowBrowser(true)}>BROWSE</C64Button>
            )}
          </div>
          {showBrowser && deviceId && (
            <div className="mt-[0.5em]">
              <C64FileBrowser
                deviceId={deviceId}
                onSelectFile={handleFileSelect}
                onClose={() => setShowBrowser(false)}
              />
            </div>
          )}
        </div>
      );

    case "sidplay":
      return (
        <div className="flex flex-col gap-[0.25em]">
          <div className="flex gap-[1ch] items-end">
            <C64Input
              placeholder="SID FILE PATH"
              value={step.file}
              onChange={(e) => onChange({ ...step, file: e.target.value })}
              className="flex-1"
            />
            {deviceId && (
              <C64Button onClick={() => setShowBrowser(true)}>BROWSE</C64Button>
            )}
          </div>
          <C64Input
            placeholder="SONG NR (OPTIONAL)"
            type="number"
            value={step.songnr ?? ""}
            onChange={(e) =>
              onChange({
                ...step,
                songnr: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          {showBrowser && deviceId && (
            <div className="mt-[0.5em]">
              <C64FileBrowser
                deviceId={deviceId}
                onSelectFile={handleFileSelect}
                onClose={() => setShowBrowser(false)}
              />
            </div>
          )}
        </div>
      );

    case "writemem":
      return (
        <div className="flex gap-[1ch]">
          <C64Input
            placeholder="ADDRESS (HEX)"
            value={step.address}
            onChange={(e) => onChange({ ...step, address: e.target.value })}
          />
          <C64Input
            placeholder="DATA (HEX)"
            value={step.data}
            onChange={(e) => onChange({ ...step, data: e.target.value })}
          />
        </div>
      );

    case "set_config":
      return (
        <div className="flex flex-col gap-[0.25em]">
          <C64Input
            placeholder="CATEGORY"
            value={step.category}
            onChange={(e) => onChange({ ...step, category: e.target.value })}
          />
          <C64Input
            placeholder="ITEM"
            value={step.item}
            onChange={(e) => onChange({ ...step, item: e.target.value })}
          />
          <C64Input
            placeholder="VALUE"
            value={step.value}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
          />
        </div>
      );

    case "delay":
      return (
        <C64Input
          placeholder="MILLISECONDS"
          type="number"
          value={step.ms}
          onChange={(e) => onChange({ ...step, ms: Number(e.target.value) || 0 })}
        />
      );

    default:
      return null;
  }
}

interface MacroEditorProps {
  macro?: Macro;
  deviceId?: string;
  onSave: (data: { name: string; description?: string; steps: MacroStep[] }) => void;
  onCancel: () => void;
}

export function MacroEditor({ macro, deviceId, onSave, onCancel }: MacroEditorProps) {
  const [name, setName] = useState(macro?.name ?? "");
  const [description, setDescription] = useState(macro?.description ?? "");
  const [steps, setSteps] = useState<MacroStep[]>(
    macro?.steps ?? [{ action: "reset" }],
  );

  const updateStep = useCallback((index: number, step: MacroStep) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? step : s)));
  }, []);

  const changeStepAction = useCallback((index: number, action: string) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? makeDefaultStep(action) : s)),
    );
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, { action: "reset" }]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    if (steps.length === 0) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      steps,
    });
  };

  return (
    <C64Box title={macro ? "EDIT MACRO" : "NEW MACRO"}>
      <div className="flex flex-col gap-[0.5em]">
        <C64Input
          placeholder="MACRO NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <C64Input
          placeholder="DESCRIPTION (OPTIONAL)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <p className="bg-c64-14-light-blue text-c64-6-blue px-[1ch]">
            STEPS ({steps.length})
          </p>
          {steps.map((step, i) => (
            <div
              key={i}
              className="py-[0.25em] border-b border-c64-11-dark-grey"
            >
              <div className="flex items-center gap-[1ch]">
                <span className="text-c64-15-light-grey" style={{ width: "3ch" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <C64Select
                  options={ACTION_OPTIONS}
                  value={step.action}
                  onChange={(e) => changeStepAction(i, e.target.value)}
                />
                <span className="flex-1 text-c64-15-light-grey truncate">
                  {stepDescription(step)}
                </span>
                <C64Button
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  className="px-[0.5ch] py-0"
                >
                  {"\u2191"}
                </C64Button>
                <C64Button
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  className="px-[0.5ch] py-0"
                >
                  {"\u2193"}
                </C64Button>
                <C64Button
                  variant="danger"
                  onClick={() => removeStep(i)}
                  disabled={steps.length <= 1}
                  className="px-[0.5ch] py-0"
                >
                  X
                </C64Button>
              </div>
              <div className="ml-[4ch] mt-[0.25em]">
                <StepFields
                  step={step}
                  onChange={(s) => updateStep(i, s)}
                  deviceId={deviceId}
                />
              </div>
            </div>
          ))}
          <div className="mt-[0.5em]">
            <C64Button onClick={addStep}>+ ADD STEP</C64Button>
          </div>
        </div>

        <div className="flex gap-[1ch]">
          <C64Button onClick={handleSave} disabled={!name.trim() || steps.length === 0}>
            SAVE
          </C64Button>
          <C64Button onClick={onCancel}>CANCEL</C64Button>
        </div>
      </div>
    </C64Box>
  );
}

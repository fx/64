import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { C64Box } from "../../components/ui/c64-box.tsx";
import { C64Button } from "../../components/ui/c64-button.tsx";
import { C64Select } from "../../components/ui/c64-select.tsx";
import { MacroEditor } from "../../components/macro/macro-editor.tsx";
import { ExecutionProgress } from "../../components/macro/execution-progress.tsx";
import {
  useMacros,
  useCreateMacro,
  useUpdateMacro,
  useDeleteMacro,
  useExecuteMacro,
  useExecutions,
} from "../../hooks/use-macros.ts";
import { useDevices } from "../../hooks/use-devices.ts";
import { useToast } from "../../components/ui/toast-context.tsx";
import type { Macro, MacroStep } from "@shared/types.ts";

export const Route = createFileRoute("/macros/")({
  component: MacroManagerPage,
});

function MacroManagerPage() {
  const { data: macros, isLoading, isError, refetch } = useMacros();
  const { data: devices } = useDevices();
  const { data: executions } = useExecutions();
  const createMutation = useCreateMacro();
  const updateMutation = useUpdateMacro();
  const deleteMutation = useDeleteMacro();
  const executeMutation = useExecuteMacro();
  const { addToast } = useToast();

  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [creating, setCreating] = useState(false);
  const [executeTarget, setExecuteTarget] = useState<{ macroId: string; deviceId: string } | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const onlineDevices = devices?.filter((d) => d.online) ?? [];
  const deviceOptions = onlineDevices.map((d) => ({
    value: d.id,
    label: d.name?.toUpperCase() || d.ip,
  }));

  const runningExecutions = executions?.filter((e) => e.status === "running") ?? [];

  const handleCreate = (data: { name: string; description?: string; steps: MacroStep[] }) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        addToast("MACRO CREATED", "success");
        setCreating(false);
      },
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const handleUpdate = (data: { name: string; description?: string; steps: MacroStep[] }) => {
    if (!editingMacro) return;
    updateMutation.mutate(
      { id: editingMacro.id, ...data },
      {
        onSuccess: () => {
          addToast("MACRO UPDATED", "success");
          setEditingMacro(null);
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => addToast("MACRO DELETED", "success"),
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const handleExecute = (macroId: string) => {
    const deviceId = selectedDeviceId || onlineDevices[0]?.id;
    if (!deviceId) {
      addToast("NO ONLINE DEVICE AVAILABLE", "error");
      return;
    }
    executeMutation.mutate(
      { macroId, deviceId },
      {
        onSuccess: (exec) => {
          addToast("MACRO EXECUTION STARTED", "success");
          setExecuteTarget({ macroId, deviceId: exec.id });
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  // Show editor if creating or editing
  if (creating) {
    return (
      <div className="p-[1em]">
        <MacroEditor
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          deviceId={onlineDevices[0]?.id}
        />
      </div>
    );
  }

  if (editingMacro) {
    return (
      <div className="p-[1em]">
        <MacroEditor
          macro={editingMacro}
          onSave={handleUpdate}
          onCancel={() => setEditingMacro(null)}
          deviceId={onlineDevices[0]?.id}
        />
      </div>
    );
  }

  return (
    <div className="p-[1em]">
      <C64Box title="MACRO MANAGER">
        <div className="flex gap-[1ch] items-center">
          <Link to="/" className="c64-button inline-block no-underline">
            {"\u2190"} DEVICES
          </Link>
          <span className="flex-1">AUTOMATION MACROS</span>
        </div>
      </C64Box>

      {/* Device selector */}
      {deviceOptions.length > 0 && (
        <div className="mt-[1em]">
          <C64Box title="TARGET DEVICE">
            <C64Select
              options={deviceOptions}
              value={selectedDeviceId || deviceOptions[0]?.value || ""}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              label="SELECT DEVICE FOR EXECUTION"
            />
          </C64Box>
        </div>
      )}

      {/* Active executions */}
      {runningExecutions.length > 0 && (
        <div className="mt-[1em]">
          <ExecutionProgress />
        </div>
      )}

      {/* Macro list */}
      <div className="mt-[1em]">
        <C64Box title="MACROS">
          <div className="flex gap-[1ch] mb-[0.5em]">
            <C64Button onClick={() => setCreating(true)}>+ NEW MACRO</C64Button>
            <C64Button onClick={() => refetch()}>REFRESH</C64Button>
          </div>

          {isLoading && (
            <p>
              <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
            </p>
          )}
          {isError && (
            <p className="text-c64-2-red">?ERROR LOADING MACROS</p>
          )}
          {macros && macros.length === 0 && <p>NO MACROS DEFINED</p>}
          {macros && macros.length > 0 && (
            <div>
              {/* Table header */}
              <div className="flex bg-c64-14-light-blue text-c64-6-blue">
                <span className="px-[1ch] flex-1">NAME</span>
                <span className="px-[1ch]" style={{ flex: "0 0 8ch" }}>
                  STEPS
                </span>
                <span className="px-[1ch]" style={{ flex: "0 0 10ch" }}>
                  TYPE
                </span>
                <span className="px-[1ch]" style={{ flex: "0 0 24ch" }}>
                  ACTIONS
                </span>
              </div>
              {/* Macro rows */}
              {macros.map((macro) => (
                <div
                  key={macro.id}
                  className="flex items-center py-[0.25em]"
                >
                  <span className="px-[1ch] flex-1 truncate">
                    {macro.name.toUpperCase()}
                  </span>
                  <span
                    className="px-[1ch]"
                    style={{ flex: "0 0 8ch" }}
                  >
                    {macro.steps.length}
                  </span>
                  <span
                    className="px-[1ch]"
                    style={{ flex: "0 0 10ch" }}
                  >
                    {macro.builtIn ? (
                      <span className="bg-c64-5-green text-c64-1-white px-[0.5ch]">
                        BUILT-IN
                      </span>
                    ) : (
                      "CUSTOM"
                    )}
                  </span>
                  <span
                    className="px-[1ch] flex gap-[1ch]"
                    style={{ flex: "0 0 24ch" }}
                  >
                    <C64Button
                      onClick={() => handleExecute(macro.id)}
                      disabled={executeMutation.isPending || onlineDevices.length === 0}
                    >
                      RUN
                    </C64Button>
                    <C64Button onClick={() => setEditingMacro(macro)}>
                      EDIT
                    </C64Button>
                    <C64Button
                      variant="danger"
                      onClick={() => handleDelete(macro.id)}
                      disabled={!!macro.builtIn || deleteMutation.isPending}
                    >
                      DEL
                    </C64Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </C64Box>
      </div>

      {/* Execution history */}
      {executeTarget && (
        <div className="mt-[1em]">
          <ExecutionProgress
            executionId={executeTarget.deviceId}
            onClose={() => setExecuteTarget(null)}
          />
        </div>
      )}
    </div>
  );
}

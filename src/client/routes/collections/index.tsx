import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { C64Box } from "../../components/ui/c64-box.tsx";
import { C64Button } from "../../components/ui/c64-button.tsx";
import { C64Input } from "../../components/ui/c64-input.tsx";
import { C64Select } from "../../components/ui/c64-select.tsx";
import {
  useCollections,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
} from "../../hooks/use-collections.ts";
import { useDevices } from "../../hooks/use-devices.ts";
import { useToast } from "../../components/ui/toast-context.tsx";
import { C64FileBrowser } from "../../components/device/file-browser.tsx";

export const Route = createFileRoute("/collections/")({
  component: CollectionsPage,
});

interface DiskFormEntry {
  label: string;
  path: string;
  drive: "a" | "b";
}

interface CollectionForm {
  name: string;
  description: string;
  disks: DiskFormEntry[];
}

const EMPTY_FORM: CollectionForm = {
  name: "",
  description: "",
  disks: [],
};

function CollectionsPage() {
  const { data: collections, isLoading, isError } = useCollections();
  const { data: devices } = useDevices();
  const createMutation = useCreateCollection();
  const updateMutation = useUpdateCollection();
  const deleteMutation = useDeleteCollection();
  const { addToast } = useToast();

  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CollectionForm>(EMPTY_FORM);
  const [browseIndex, setBrowseIndex] = useState<number | null>(null);
  const [browseDeviceId, setBrowseDeviceId] = useState<string>("");

  const onlineDevices = devices?.filter((d) => d.online) ?? [];

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setBrowseIndex(null);
    setMode("create");
  };

  const startEdit = (col: {
    id: string;
    name: string;
    description?: string;
    disks: Array<{ label: string; path: string; drive: "a" | "b" }>;
  }) => {
    setForm({
      name: col.name,
      description: col.description ?? "",
      disks: col.disks.map((d) => ({
        label: d.label,
        path: d.path,
        drive: d.drive,
      })),
    });
    setEditId(col.id);
    setBrowseIndex(null);
    setMode("edit");
  };

  const cancel = () => {
    setMode("list");
    setEditId(null);
    setBrowseIndex(null);
  };

  const addDisk = () => {
    setForm((f) => ({
      ...f,
      disks: [
        ...f.disks,
        { label: `DISK ${f.disks.length + 1}`, path: "", drive: "a" as const },
      ],
    }));
  };

  const removeDisk = (index: number) => {
    setForm((f) => ({
      ...f,
      disks: f.disks.filter((_, i) => i !== index),
    }));
    if (browseIndex === index) setBrowseIndex(null);
  };

  const moveDisk = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setForm((f) => {
      if (target < 0 || target >= f.disks.length) return f;
      const disks = [...f.disks];
      [disks[index], disks[target]] = [disks[target], disks[index]];
      return { ...f, disks };
    });
  };

  const updateDisk = (
    index: number,
    field: keyof DiskFormEntry,
    value: string,
  ) => {
    setForm((f) => ({
      ...f,
      disks: f.disks.map((d, i) =>
        i === index ? { ...d, [field]: value } : d,
      ),
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      addToast("NAME IS REQUIRED", "error");
      return;
    }
    if (form.disks.some((d) => !d.path.trim())) {
      addToast("ALL DISKS MUST HAVE A PATH", "error");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      disks: form.disks.map((d) => ({
        label: d.label.trim() || "UNTITLED",
        path: d.path.trim(),
        drive: d.drive,
      })),
    };

    if (mode === "create") {
      createMutation.mutate(payload, {
        onSuccess: () => {
          addToast("COLLECTION CREATED", "success");
          cancel();
        },
        onError: (err) => addToast(err.message, "error"),
      });
    } else if (editId) {
      updateMutation.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            addToast("COLLECTION UPDATED", "success");
            cancel();
          },
          onError: (err) => addToast(err.message, "error"),
        },
      );
    }
  };

  const handleDelete = (id: string, name: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => addToast(`DELETED ${name}`, "success"),
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-[1em]">
      <div className="mb-[1em]">
        <Link to="/" className="c64-button inline-block no-underline">
          &lt; BACK TO DEVICES
        </Link>
      </div>

      <C64Box title="DISK FLIP COLLECTIONS">
        <p>MANAGE MULTI-DISK GAME COLLECTIONS</p>
      </C64Box>

      {mode === "list" && (
        <div className="mt-[1em]">
          <C64Box title="COLLECTIONS">
            <div className="flex gap-[1ch] mb-[0.5em]">
              <C64Button onClick={startCreate}>+ NEW COLLECTION</C64Button>
            </div>

            {isLoading && (
              <p>
                <span className="animate-c64-cursor">{"\u2588"}</span>{" "}
                LOADING...
              </p>
            )}
            {isError && (
              <p className="text-c64-2-red">?ERROR LOADING COLLECTIONS</p>
            )}

            {collections && collections.length === 0 && (
              <p>NO COLLECTIONS YET</p>
            )}

            {collections && collections.length > 0 && (
              <div>
                {/* Table header */}
                <div className="flex bg-c64-14-light-blue text-c64-6-blue">
                  <span className="px-[1ch] flex-1">NAME</span>
                  <span className="px-[1ch]" style={{ flex: "0 0 8ch" }}>
                    DISKS
                  </span>
                  <span className="px-[1ch]" style={{ flex: "0 0 14ch" }}>
                    ACTIONS
                  </span>
                </div>
                {/* Collection rows */}
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center py-[0.25em]"
                  >
                    <span className="px-[1ch] flex-1 truncate">
                      {col.name.toUpperCase()}
                    </span>
                    <span
                      className="px-[1ch]"
                      style={{ flex: "0 0 8ch" }}
                    >
                      {col.disks.length}
                    </span>
                    <span
                      className="px-[1ch] flex gap-[1ch]"
                      style={{ flex: "0 0 14ch" }}
                    >
                      <C64Button onClick={() => startEdit(col)}>
                        EDIT
                      </C64Button>
                      <C64Button
                        variant="danger"
                        onClick={() => handleDelete(col.id, col.name)}
                        disabled={deleteMutation.isPending}
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
      )}

      {(mode === "create" || mode === "edit") && (
        <div className="mt-[1em]">
          <C64Box
            title={mode === "create" ? "NEW COLLECTION" : "EDIT COLLECTION"}
          >
            <div className="flex flex-col gap-[0.5em]">
              <C64Input
                placeholder="COLLECTION NAME"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <C64Input
                placeholder="DESCRIPTION (OPTIONAL)"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />

              {/* Device selector for file browser */}
              {onlineDevices.length > 0 && (
                <C64Select
                  label="DEVICE FOR FILE BROWSER"
                  options={[
                    { value: "", label: "-- SELECT DEVICE --" },
                    ...onlineDevices.map((d) => ({
                      value: d.id,
                      label: (d.name || d.ip).toUpperCase(),
                    })),
                  ]}
                  value={browseDeviceId}
                  onChange={(e) => setBrowseDeviceId(e.target.value)}
                />
              )}

              {/* Disk entries */}
              <div className="mt-[0.5em]">
                <div className="flex bg-c64-14-light-blue text-c64-6-blue mb-[0.25em]">
                  <span className="px-[1ch]" style={{ flex: "0 0 4ch" }}>
                    #
                  </span>
                  <span className="px-[1ch] flex-1">LABEL</span>
                  <span className="px-[1ch] flex-1">PATH</span>
                  <span className="px-[1ch]" style={{ flex: "0 0 6ch" }}>
                    DRV
                  </span>
                  <span className="px-[1ch]" style={{ flex: "0 0 18ch" }}>
                    ACTIONS
                  </span>
                </div>

                {form.disks.length === 0 && (
                  <p className="px-[1ch]">NO DISKS ADDED YET</p>
                )}

                {form.disks.map((disk, i) => (
                  <div key={i}>
                    <div className="flex items-center py-[0.25em]">
                      <span
                        className="px-[1ch]"
                        style={{ flex: "0 0 4ch" }}
                      >
                        {i + 1}
                      </span>
                      <span className="px-[1ch] flex-1">
                        <C64Input
                          value={disk.label}
                          onChange={(e) =>
                            updateDisk(i, "label", e.target.value)
                          }
                          className="w-full"
                        />
                      </span>
                      <span className="px-[1ch] flex-1 truncate">
                        {disk.path || "(NONE)"}
                      </span>
                      <span
                        className="px-[1ch]"
                        style={{ flex: "0 0 6ch" }}
                      >
                        <C64Select
                          options={[
                            { value: "a", label: "A" },
                            { value: "b", label: "B" },
                          ]}
                          value={disk.drive}
                          onChange={(e) =>
                            updateDisk(
                              i,
                              "drive",
                              e.target.value as "a" | "b",
                            )
                          }
                        />
                      </span>
                      <span
                        className="px-[1ch] flex gap-[1ch]"
                        style={{ flex: "0 0 18ch" }}
                      >
                        {browseDeviceId && (
                          <C64Button
                            onClick={() =>
                              setBrowseIndex(browseIndex === i ? null : i)
                            }
                          >
                            {browseIndex === i ? "HIDE" : "FILE"}
                          </C64Button>
                        )}
                        <C64Button
                          onClick={() => moveDisk(i, -1)}
                          disabled={i === 0}
                        >
                          {"\u2191"}
                        </C64Button>
                        <C64Button
                          onClick={() => moveDisk(i, 1)}
                          disabled={i === form.disks.length - 1}
                        >
                          {"\u2193"}
                        </C64Button>
                        <C64Button
                          variant="danger"
                          onClick={() => removeDisk(i)}
                        >
                          X
                        </C64Button>
                      </span>
                    </div>

                    {/* Inline file browser for this disk entry */}
                    {browseIndex === i && browseDeviceId && (
                      <div className="ml-[4ch] mb-[0.5em]">
                        <C64FileBrowser
                          deviceId={browseDeviceId}
                          onSelectDisk={(path) => {
                            updateDisk(i, "path", path);
                            setBrowseIndex(null);
                            addToast(
                              `SET PATH: ${path.split("/").pop()}`,
                              "success",
                            );
                          }}
                          onClose={() => setBrowseIndex(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <div className="mt-[0.5em]">
                  <C64Button onClick={addDisk}>+ ADD DISK</C64Button>
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-[1ch] mt-[0.5em]">
                <C64Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "SAVING..." : "SAVE"}
                </C64Button>
                <C64Button onClick={cancel}>CANCEL</C64Button>
              </div>
            </div>
          </C64Box>
        </div>
      )}
    </div>
  );
}

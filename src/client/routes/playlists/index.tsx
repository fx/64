import { useState, useCallback, type DragEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { C64Box } from "../../components/ui/c64-box.tsx";
import { C64Button } from "../../components/ui/c64-button.tsx";
import { C64Input } from "../../components/ui/c64-input.tsx";
import { useToast } from "../../components/ui/toast-context.tsx";
import {
  usePlaylists,
  useCreatePlaylist,
  useUpdatePlaylist,
  useDeletePlaylist,
  usePlayTrack,
} from "../../hooks/use-playback.ts";
import { useDevices } from "../../hooks/use-devices.ts";
import { useFileListing, type DirectoryEntry } from "../../hooks/use-file-browser.ts";
import type { Track, Playlist } from "@shared/types.ts";

export const Route = createFileRoute("/playlists/")({
  component: PlaylistManagerPage,
});

const MUSIC_EXTENSIONS = new Set(["sid", "mod"]);

function isMusicFile(entry: DirectoryEntry): boolean {
  return entry.type === "file" && !!entry.fileType && MUSIC_EXTENSIONS.has(entry.fileType);
}

function trackFromEntry(entry: DirectoryEntry, currentPath: string): Track {
  const ext = entry.fileType ?? "";
  return {
    path: currentPath + entry.name,
    type: ext === "mod" ? "mod" : "sid",
    title: entry.name.replace(/\.[^.]+$/, ""),
  };
}

function PlaylistManagerPage() {
  const { addToast } = useToast();
  const playlists = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTracks, setEditTracks] = useState<Track[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPlaylist.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => {
          addToast("PLAYLIST CREATED", "success");
          setNewName("");
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  const startEditing = (playlist: Playlist) => {
    setEditingId(playlist.id);
    setEditName(playlist.name);
    setEditTracks([...playlist.tracks]);
    setShowBrowser(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditTracks([]);
    setShowBrowser(false);
  };

  const saveEditing = () => {
    if (!editingId) return;
    updatePlaylist.mutate(
      { id: editingId, name: editName.trim() || undefined, tracks: editTracks },
      {
        onSuccess: () => {
          addToast("PLAYLIST UPDATED", "success");
          cancelEditing();
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  const handleDelete = (id: string) => {
    deletePlaylist.mutate(id, {
      onSuccess: () => {
        addToast("PLAYLIST DELETED", "success");
        if (editingId === id) cancelEditing();
      },
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const addTrack = (track: Track) => {
    setEditTracks((prev) => [...prev, track]);
    addToast(`ADDED ${track.title.toUpperCase()}`, "success");
  };

  const removeTrack = (index: number) => {
    setEditTracks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSongNr = (index: number, songnr: number | undefined) => {
    setEditTracks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, songnr } : t)),
    );
  };

  const handleDragStart = (index: number) => {
    setDragIdx(index);
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === index) return;
    setEditTracks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIdx(index);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  return (
    <div className="p-[1em]">
      <div className="mb-[1em]">
        <Link to="/" className="c64-button inline-block no-underline">
          &lt; BACK TO DEVICES
        </Link>
      </div>

      <C64Box title="PLAYLISTS">
        <p>SID/MOD MUSIC PLAYLIST MANAGER</p>
      </C64Box>

      {/* Create new playlist */}
      <div className="mt-[1em]">
        <C64Box title="NEW PLAYLIST">
          <div className="flex gap-[1ch] items-end">
            <C64Input
              placeholder="PLAYLIST NAME"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <C64Button
              onClick={handleCreate}
              disabled={createPlaylist.isPending}
            >
              {createPlaylist.isPending ? "CREATING..." : "CREATE"}
            </C64Button>
          </div>
        </C64Box>
      </div>

      {/* Playlist list */}
      <div className="mt-[1em]">
        <C64Box title="ALL PLAYLISTS">
          {playlists.isLoading && (
            <p>
              <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
            </p>
          )}
          {playlists.isError && (
            <p className="text-c64-2-red">
              {playlists.error?.message || "FAILED TO LOAD PLAYLISTS"}
            </p>
          )}
          {playlists.data && playlists.data.length === 0 && (
            <p>NO PLAYLISTS YET</p>
          )}
          {playlists.data && playlists.data.length > 0 && (
            <div className="flex flex-col gap-[0.5em]">
              {playlists.data.map((pl) => (
                <div key={pl.id}>
                  <div className="flex items-center gap-[1ch]">
                    <span className="bg-c64-5-green text-c64-0-black px-[1ch]">
                      {"\u266B"}
                    </span>
                    <span className="flex-1 truncate">
                      {pl.name.toUpperCase()} ({pl.tracks.length} TRACKS)
                    </span>
                    <C64Button
                      onClick={() => startEditing(pl)}
                      className="px-[0.5ch] py-0 text-[14px]"
                    >
                      EDIT
                    </C64Button>
                    <PlaylistPlayButton playlist={pl} />
                    <C64Button
                      onClick={() => handleDelete(pl.id)}
                      variant="danger"
                      className="px-[0.5ch] py-0 text-[14px]"
                      disabled={deletePlaylist.isPending}
                    >
                      DEL
                    </C64Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </C64Box>
      </div>

      {/* Editing panel */}
      {editingId && (
        <div className="mt-[1em]">
          <C64Box title={`EDITING: ${editName.toUpperCase()}`}>
            <div className="flex flex-col gap-[0.5em]">
              {/* Rename */}
              <div className="flex gap-[1ch] items-end">
                <C64Input
                  placeholder="PLAYLIST NAME"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              {/* Track list */}
              <div className="mt-[0.5em]">
                {editTracks.length === 0 ? (
                  <p>NO TRACKS — USE BROWSER TO ADD</p>
                ) : (
                  <div className="c64-box-border">
                    {/* Header */}
                    <div className="flex bg-c64-14-light-blue text-c64-6-blue">
                      <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 3ch" }}>
                        #
                      </span>
                      <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 4ch" }}>
                        TYPE
                      </span>
                      <span className="px-[1ch] py-[0.25em] flex-1">TITLE</span>
                      <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 6ch" }}>
                        SONG
                      </span>
                      <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 5ch" }}>
                        {""}
                      </span>
                    </div>
                    {editTracks.map((track, idx) => (
                      <div
                        key={`${track.path}-${idx}`}
                        className={`flex items-center cursor-grab ${
                          dragIdx === idx
                            ? "bg-c64-14-light-blue text-c64-6-blue"
                            : "hover:bg-c64-11-dark-grey"
                        }`}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                      >
                        <span
                          className="px-[1ch] py-[0.25em]"
                          style={{ flex: "0 0 3ch" }}
                        >
                          {idx + 1}
                        </span>
                        <span
                          className="px-[1ch] py-[0.25em]"
                          style={{ flex: "0 0 4ch" }}
                        >
                          {track.type.toUpperCase()}
                        </span>
                        <span className="px-[1ch] py-[0.25em] flex-1 truncate">
                          {track.title.toUpperCase()}
                        </span>
                        <span
                          className="px-[1ch] py-[0.25em]"
                          style={{ flex: "0 0 6ch" }}
                        >
                          {track.type === "sid" ? (
                            <input
                              type="number"
                              min={0}
                              max={255}
                              value={track.songnr ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateSongNr(
                                  idx,
                                  val === "" ? undefined : Number(val),
                                );
                              }}
                              className="c64-control w-[5ch] px-[0.5ch] py-0 text-[14px]"
                              placeholder="-"
                            />
                          ) : (
                            "-"
                          )}
                        </span>
                        <span
                          className="px-[1ch] py-[0.25em]"
                          style={{ flex: "0 0 5ch" }}
                        >
                          <C64Button
                            onClick={() => removeTrack(idx)}
                            variant="danger"
                            className="px-[0.5ch] py-0 text-[14px]"
                          >
                            X
                          </C64Button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-[1ch]">
                <C64Button
                  onClick={() => setShowBrowser(!showBrowser)}
                >
                  {showBrowser ? "HIDE BROWSER" : "+ ADD TRACKS"}
                </C64Button>
                <C64Button
                  onClick={saveEditing}
                  disabled={updatePlaylist.isPending}
                >
                  {updatePlaylist.isPending ? "SAVING..." : "SAVE"}
                </C64Button>
                <C64Button onClick={cancelEditing}>CANCEL</C64Button>
              </div>

              {/* Music file browser */}
              {showBrowser && (
                <div className="mt-[0.5em]">
                  <MusicBrowser onAddTrack={addTrack} />
                </div>
              )}
            </div>
          </C64Box>
        </div>
      )}
    </div>
  );
}

/** Button to play entire playlist on a device */
function PlaylistPlayButton({ playlist }: { playlist: Playlist }) {
  const devices = useDevices();
  const [showDevices, setShowDevices] = useState(false);

  if (playlist.tracks.length === 0) return null;

  if (!showDevices) {
    return (
      <C64Button
        onClick={() => setShowDevices(true)}
        className="px-[0.5ch] py-0 text-[14px]"
      >
        {"\u25B6"} PLAY
      </C64Button>
    );
  }

  const onlineDevices = devices.data?.filter((d) => d.online) ?? [];

  return (
    <div className="flex gap-[1ch] items-center">
      {onlineDevices.length === 0 ? (
        <span className="text-c64-2-red text-[14px]">NO DEVICES ONLINE</span>
      ) : (
        onlineDevices.map((device) => (
          <PlayOnDeviceButton
            key={device.id}
            deviceId={device.id}
            deviceName={device.name}
            playlistId={playlist.id}
          />
        ))
      )}
      <C64Button
        onClick={() => setShowDevices(false)}
        className="px-[0.5ch] py-0 text-[14px]"
      >
        X
      </C64Button>
    </div>
  );
}

function PlayOnDeviceButton({
  deviceId,
  deviceName,
  playlistId,
}: {
  deviceId: string;
  deviceName: string;
  playlistId: string;
}) {
  const play = usePlayTrack(deviceId);
  const { addToast } = useToast();

  return (
    <C64Button
      onClick={() =>
        play.mutate(
          { playlistId },
          {
            onSuccess: () => addToast(`PLAYING ON ${deviceName.toUpperCase()}`, "success"),
            onError: (err) => addToast(err.message, "error"),
          },
        )
      }
      disabled={play.isPending}
      className="px-[0.5ch] py-0 text-[14px]"
    >
      {play.isPending ? "..." : deviceName.toUpperCase()}
    </C64Button>
  );
}

/** Simplified file browser for music files only */
function MusicBrowser({ onAddTrack }: { onAddTrack: (track: Track) => void }) {
  const devices = useDevices();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("/");

  const onlineDevices = devices.data?.filter((d) => d.online) ?? [];

  if (!selectedDevice) {
    return (
      <C64Box title="SELECT DEVICE">
        {onlineDevices.length === 0 ? (
          <p>NO DEVICES ONLINE</p>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {onlineDevices.map((d) => (
              <div
                key={d.id}
                className="cursor-pointer hover:bg-c64-14-light-blue hover:text-c64-6-blue px-[1ch] py-[0.25em]"
                onClick={() => setSelectedDevice(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedDevice(d.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {d.name.toUpperCase()} ({d.ip})
              </div>
            ))}
          </div>
        )}
      </C64Box>
    );
  }

  return (
    <MusicFileListing
      deviceId={selectedDevice}
      currentPath={currentPath}
      onNavigate={setCurrentPath}
      onAddTrack={onAddTrack}
      onBack={() => setSelectedDevice(null)}
    />
  );
}

function MusicFileListing({
  deviceId,
  currentPath,
  onNavigate,
  onAddTrack,
  onBack,
}: {
  deviceId: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  onAddTrack: (track: Track) => void;
  onBack: () => void;
}) {
  const listing = useFileListing(deviceId, currentPath);

  const entries = listing.data?.entries ?? [];
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  // Show directories and music files only
  const filtered = sorted.filter(
    (e) => e.type === "directory" || isMusicFile(e),
  );

  const navigateTo = useCallback(
    (path: string) => {
      let normalized = path.startsWith("/") ? path : "/" + path;
      if (!normalized.endsWith("/")) normalized += "/";
      onNavigate(normalized);
    },
    [onNavigate],
  );

  return (
    <C64Box title="MUSIC BROWSER">
      <div className="flex flex-col gap-[0.5em]">
        <div className="flex gap-[1ch]">
          <C64Button onClick={onBack}>
            &lt; DEVICES
          </C64Button>
          <span className="flex-1 truncate">{currentPath.toUpperCase()}</span>
        </div>

        {listing.isLoading && (
          <p>
            <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
          </p>
        )}

        {listing.isError && (
          <p className="text-c64-2-red">
            {listing.error?.message || "FAILED TO LIST DIRECTORY"}
          </p>
        )}

        {listing.data && (
          <div className="c64-box-border">
            {/* Parent directory */}
            {listing.data.parent && (
              <div
                className="flex items-center cursor-pointer hover:bg-c64-14-light-blue hover:text-c64-6-blue"
                onClick={() => navigateTo(listing.data!.parent!)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateTo(listing.data!.parent!);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 3ch" }}>
                  {"\u{EE71}"}
                </span>
                <span className="px-[1ch] py-[0.25em] flex-1">..</span>
              </div>
            )}

            {filtered.length === 0 && !listing.data.parent && (
              <div className="px-[1ch] py-[0.5em]">NO MUSIC FILES HERE</div>
            )}

            {filtered.map((entry) => (
              <div
                key={entry.name}
                className="flex items-center cursor-pointer hover:bg-c64-14-light-blue hover:text-c64-6-blue"
                onClick={() => {
                  if (entry.type === "directory") {
                    navigateTo(currentPath + entry.name + "/");
                  } else {
                    onAddTrack(trackFromEntry(entry, currentPath));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (entry.type === "directory") {
                      navigateTo(currentPath + entry.name + "/");
                    } else {
                      onAddTrack(trackFromEntry(entry, currentPath));
                    }
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 3ch" }}>
                  {entry.type === "directory"
                    ? "\u{EE71}"
                    : entry.fileType === "sid"
                      ? "\u2588S"
                      : "\u2588M"}
                </span>
                <span className="px-[1ch] py-[0.25em] flex-1 truncate">
                  {entry.name.toUpperCase()}
                </span>
                {entry.type === "file" && (
                  <span className="px-[1ch] py-[0.25em] text-c64-5-green">
                    + ADD
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </C64Box>
  );
}

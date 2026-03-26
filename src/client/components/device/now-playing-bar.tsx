import { C64Button } from "../ui/c64-button.tsx";
import {
  usePlaybackState,
  usePlaybackNext,
  usePlaybackPrev,
  usePlaybackStop,
  usePlaylist,
} from "../../hooks/use-playback.ts";

interface NowPlayingBarProps {
  deviceId: string;
}

export function NowPlayingBar({ deviceId }: NowPlayingBarProps) {
  const playback = usePlaybackState(deviceId);
  const next = usePlaybackNext(deviceId);
  const prev = usePlaybackPrev(deviceId);
  const stop = usePlaybackStop(deviceId);

  const state = playback.data;
  const playlist = usePlaylist(state?.playlistId ?? "");

  if (!state || state.status === "stopped") return null;

  const track = state.currentTrack;
  if (!track) return null;

  const typeLabel = track.type.toUpperCase();
  const songLabel =
    track.type === "sid" && track.songnr !== undefined
      ? ` #${track.songnr}`
      : "";
  const totalTracks = playlist.data?.tracks.length;
  const positionLabel = state.playlistId
    ? `${state.position + 1}/${totalTracks ?? "?"}`
    : "";

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-c64-0-black text-c64-5-green z-50">
      <div className="flex items-center gap-[1ch] px-[1ch] py-[0.25em]">
        {/* Track type badge */}
        <span className="bg-c64-5-green text-c64-0-black px-[1ch]">
          {typeLabel}
          {songLabel}
        </span>

        {/* Track name */}
        <span className="flex-1 truncate">
          {"\u266B"} {track.title.toUpperCase()}
        </span>

        {/* Playlist position */}
        {positionLabel && (
          <span className="text-c64-13-light-green">{positionLabel}</span>
        )}

        {/* Controls */}
        {state.playlistId && (
          <>
            <C64Button
              onClick={() => prev.mutate()}
              disabled={prev.isPending}
              className="px-[0.5ch] py-0 text-[14px]"
            >
              {"\u25C0"} PREV
            </C64Button>
            <C64Button
              onClick={() => next.mutate()}
              disabled={next.isPending}
              className="px-[0.5ch] py-0 text-[14px]"
            >
              NEXT {"\u25B6"}
            </C64Button>
          </>
        )}
        <C64Button
          onClick={() => stop.mutate()}
          disabled={stop.isPending}
          variant="danger"
          className="px-[0.5ch] py-0 text-[14px]"
        >
          {"\u25A0"} STOP
        </C64Button>
      </div>
    </div>
  );
}

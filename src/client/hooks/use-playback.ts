import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Playlist, Track, PlaybackState } from "@shared/types.ts";
import { throwOnNotOk } from "../lib/api.ts";

// ── Playlist CRUD ─────────────────────────────────────

export function usePlaylists() {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<Playlist[]> => {
      const res = await fetch("/api/playlists");
      await throwOnNotOk(res, "Failed to load playlists");
      return res.json();
    },
  });
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: ["playlists", id],
    queryFn: async (): Promise<Playlist> => {
      const res = await fetch(`/api/playlists/${id}`);
      await throwOnNotOk(res, "Failed to load playlist");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; tracks?: Track[] }): Promise<Playlist> => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await throwOnNotOk(res, "Failed to create playlist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      tracks?: Track[];
    }): Promise<Playlist> => {
      const res = await fetch(`/api/playlists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await throwOnNotOk(res, "Failed to update playlist");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlists", variables.id] });
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      await throwOnNotOk(res, "Failed to delete playlist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
}

// ── Playback Control ──────────────────────────────────

export function usePlaybackState(deviceId: string) {
  return useQuery({
    queryKey: ["devices", deviceId, "playback"],
    queryFn: async (): Promise<PlaybackState> => {
      const res = await fetch(`/api/devices/${deviceId}/playback`);
      await throwOnNotOk(res, "Failed to get playback state");
      return res.json();
    },
    enabled: !!deviceId,
    refetchInterval: 10_000,
  });
}

export function usePlayTrack(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      track?: Track;
      playlistId?: string;
      position?: number;
    }): Promise<PlaybackState> => {
      const res = await fetch(`/api/devices/${deviceId}/playback/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await throwOnNotOk(res, "Failed to play track");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["devices", deviceId, "playback"], data);
    },
  });
}

function usePlaybackAction(deviceId: string, action: string, errorMsg: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PlaybackState> => {
      const res = await fetch(`/api/devices/${deviceId}/playback/${action}`, {
        method: "POST",
      });
      await throwOnNotOk(res, errorMsg);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["devices", deviceId, "playback"], data);
    },
  });
}

export function usePlaybackNext(deviceId: string) {
  return usePlaybackAction(deviceId, "next", "Failed to skip to next");
}

export function usePlaybackPrev(deviceId: string) {
  return usePlaybackAction(deviceId, "prev", "Failed to skip to previous");
}

export function usePlaybackStop(deviceId: string) {
  return usePlaybackAction(deviceId, "stop", "Failed to stop playback");
}

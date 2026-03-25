import { useMutation, useQueryClient } from "@tanstack/react-query";

function extractErrorMessage(body: unknown, fallback: string): string {
  return (
    (body as { errors?: string[] })?.errors?.[0] ||
    (body as { error?: string })?.error ||
    fallback
  );
}

async function throwOnError(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(extractErrorMessage(body, fallback));
  }
  // C64U API can return errors in a 200 response
  if (res.headers.get("content-type")?.includes("application/json")) {
    const body = await res.json().catch(() => null);
    const errors = (body as { errors?: string[] })?.errors;
    if (errors && errors.length > 0) {
      throw new Error(errors[0]);
    }
  }
}

async function deviceAction(
  deviceId: string,
  path: string,
  method = "PUT",
): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/v1/${path}`, { method });
  await throwOnError(res,"Action failed");
}

export function useDeviceActions(deviceId: string) {
  const queryClient = useQueryClient();

  const invalidateDrives = () =>
    queryClient.invalidateQueries({
      queryKey: ["devices", deviceId, "drives"],
    });

  const reset = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:reset"),
  });

  const reboot = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:reboot"),
  });

  const pause = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:pause"),
  });

  const resume = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:resume"),
  });

  const poweroff = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:poweroff"),
  });

  const menuButton = useMutation({
    mutationFn: () => deviceAction(deviceId, "machine:menu_button"),
  });

  const removeDisk = useMutation({
    mutationFn: (drive: string) =>
      deviceAction(deviceId, `drives/${drive}:remove`),
    onSuccess: invalidateDrives,
  });

  const mountByPath = useMutation({
    mutationFn: ({
      drive,
      imagePath,
    }: {
      drive: string;
      imagePath: string;
    }) =>
      deviceAction(
        deviceId,
        `drives/${drive}:mount?image=${encodeURIComponent(imagePath)}`,
      ),
    onSuccess: invalidateDrives,
  });

  const uploadMount = useMutation({
    mutationFn: async ({
      file,
      drive,
      mode,
    }: {
      file: File;
      drive: string;
      mode: string;
    }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("drive", drive);
      form.append("mode", mode);

      const res = await fetch(`/api/devices/${deviceId}/upload-mount`, {
        method: "POST",
        body: form,
      });
      await throwOnError(res,"Upload failed");
    },
    onSuccess: invalidateDrives,
  });

  return {
    reset,
    reboot,
    pause,
    resume,
    poweroff,
    menuButton,
    removeDisk,
    mountByPath,
    uploadMount,
  };
}

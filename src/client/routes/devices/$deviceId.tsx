import { createFileRoute, Link } from "@tanstack/react-router";
import { C64Box } from "../../components/ui/c64-box.tsx";
import { C64StatusBadge } from "../../components/ui/c64-status-badge.tsx";
import {
  useDevice,
  useDeviceInfo,
  useDriveStatus,
} from "../../hooks/use-device-info.ts";
import { useDeviceActions } from "../../hooks/use-device-actions.ts";
import { useToast } from "../../components/ui/toast-context.tsx";
import { DriveStatusPanel } from "../../components/device/drive-status-panel.tsx";
import { MachineControls } from "../../components/device/machine-controls.tsx";
import { UploadMountPanel } from "../../components/device/upload-mount-panel.tsx";

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceDashboardPage,
});

function DeviceDashboardPage() {
  const { deviceId } = Route.useParams();
  const device = useDevice(deviceId);
  const info = useDeviceInfo(deviceId);
  const drives = useDriveStatus(deviceId);
  const actions = useDeviceActions(deviceId);
  const { addToast } = useToast();

  const isLoading = device.isLoading || info.isLoading || drives.isLoading;

  return (
    <div className="p-[1em]">
      <div className="mb-[1em]">
        <Link to="/" className="c64-button inline-block no-underline">
          &lt; BACK TO DEVICES
        </Link>
      </div>

      {isLoading && (
        <p>
          <span className="animate-c64-cursor">{"\u2588"}</span> LOADING
          DEVICE...
        </p>
      )}

      {device.isError && (
        <C64Box title="ERROR">
          <p className="text-c64-2-red">
            {device.error?.message || "FAILED TO LOAD DEVICE"}
          </p>
        </C64Box>
      )}

      {device.data && (
        <>
          <C64Box
            title={device.data.name?.toUpperCase() || `DEVICE ${deviceId}`}
          >
            <C64StatusBadge online={device.data.online} />
            <span className="ml-[2ch]">{device.data.ip}</span>
          </C64Box>

          <div className="mt-[1em]">
            <C64Box title="DEVICE INFO">
              {info.isError ? (
                <p className="text-c64-2-red">
                  {info.error?.message || "CANNOT REACH DEVICE"}
                </p>
              ) : info.data ? (
                <div className="flex flex-col gap-[0.25em]">
                  <div>PRODUCT: {info.data.product}</div>
                  <div>FIRMWARE: {info.data.firmware_version}</div>
                  <div>FPGA: {info.data.fpga_version}</div>
                  <div>HOSTNAME: {info.data.hostname}</div>
                  <div>UNIQUE ID: {info.data.unique_id}</div>
                  <div>LAST SEEN: {device.data.lastSeen}</div>
                </div>
              ) : null}
            </C64Box>
          </div>

          <div className="mt-[1em]">
            {drives.isError ? (
              <C64Box title="DRIVES">
                <p className="text-c64-2-red">
                  {drives.error?.message || "CANNOT LOAD DRIVES"}
                </p>
              </C64Box>
            ) : drives.data ? (
              <DriveStatusPanel
                drives={drives.data.drives}
                onRemoveDisk={(drive) =>
                  actions.removeDisk.mutate(drive, {
                    onSuccess: () =>
                      addToast(
                        `DISK REMOVED FROM DRIVE ${drive.toUpperCase()}`,
                        "success",
                      ),
                    onError: (err) =>
                      addToast(`REMOVE FAILED: ${err.message}`, "error"),
                  })
                }
                isRemoving={actions.removeDisk.isPending}
              />
            ) : null}
          </div>

          <div className="mt-[1em]">
            <MachineControls deviceId={deviceId} />
          </div>

          <div className="mt-[1em]">
            <UploadMountPanel deviceId={deviceId} />
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { useDeviceActions } from "../../hooks/use-device-actions.ts";
import { useToast } from "../ui/toast-context.tsx";

interface MachineControlsProps {
  deviceId: string;
}

export function MachineControls({ deviceId }: MachineControlsProps) {
  const actions = useDeviceActions(deviceId);
  const { addToast } = useToast();
  const [confirmPowerOff, setConfirmPowerOff] = useState(false);

  const handleAction = (
    action: { mutate: (v: void, opts: { onSuccess: () => void; onError: (e: Error) => void }) => void },
    label: string,
  ) => {
    action.mutate(undefined, {
      onSuccess: () => addToast(`${label} OK`, "success"),
      onError: (err) => addToast(`${label} FAILED: ${err.message}`, "error"),
    });
  };

  return (
    <C64Box title="MACHINE CONTROLS">
      <div className="flex flex-col gap-[0.5em]">
        <div className="flex gap-[1ch] flex-wrap">
          <C64Button
            onClick={() => handleAction(actions.reset, "RESET")}
            disabled={actions.reset.isPending}
          >
            {actions.reset.isPending ? "RESETTING..." : "RESET"}
          </C64Button>
          <C64Button
            onClick={() => handleAction(actions.reboot, "REBOOT")}
            disabled={actions.reboot.isPending}
          >
            {actions.reboot.isPending ? "REBOOTING..." : "REBOOT"}
          </C64Button>
          <C64Button
            onClick={() => handleAction(actions.menuButton, "MENU")}
            disabled={actions.menuButton.isPending}
          >
            MENU
          </C64Button>
        </div>

        <div className="flex gap-[1ch] flex-wrap">
          <C64Button
            onClick={() => handleAction(actions.pause, "PAUSE")}
            disabled={actions.pause.isPending}
          >
            PAUSE
          </C64Button>
          <C64Button
            onClick={() => handleAction(actions.resume, "RESUME")}
            disabled={actions.resume.isPending}
          >
            RESUME
          </C64Button>
        </div>

        <div className="flex gap-[1ch] items-center flex-wrap">
          {!confirmPowerOff ? (
            <C64Button
              variant="danger"
              onClick={() => setConfirmPowerOff(true)}
            >
              POWER OFF
            </C64Button>
          ) : (
            <>
              <span>CONFIRM POWER OFF?</span>
              <C64Button
                variant="danger"
                onClick={() => {
                  setConfirmPowerOff(false);
                  handleAction(actions.poweroff, "POWER OFF");
                }}
                disabled={actions.poweroff.isPending}
              >
                YES
              </C64Button>
              <C64Button onClick={() => setConfirmPowerOff(false)}>
                NO
              </C64Button>
            </>
          )}
        </div>
      </div>
    </C64Box>
  );
}

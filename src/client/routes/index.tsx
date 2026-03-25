import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { C64Box } from "../components/ui/c64-box.tsx";
import { C64Button } from "../components/ui/c64-button.tsx";
import { C64Input } from "../components/ui/c64-input.tsx";
import { C64StatusBadge } from "../components/ui/c64-status-badge.tsx";
import {
  useDevices,
  useRegisterDevice,
  useDeleteDevice,
} from "../hooks/use-devices.ts";
import { useToast } from "../components/ui/toast-context.tsx";

export const Route = createFileRoute("/")({
  component: DeviceListPage,
});

function DeviceListPage() {
  const { data: devices, isLoading, isError, refetch } = useDevices();
  const registerMutation = useRegisterDevice();
  const deleteMutation = useDeleteDevice();
  const { addToast } = useToast();

  const [ip, setIp] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = () => {
    if (!ip.trim()) return;
    registerMutation.mutate(
      {
        ip: ip.trim(),
        name: name.trim() || undefined,
        password: password.trim() || undefined,
      },
      {
        onSuccess: () => {
          addToast("DEVICE REGISTERED SUCCESSFULLY", "success");
          setIp("");
          setName("");
          setPassword("");
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  return (
    <div className="p-[1em]">
      <C64Box title="C64 ULTIMATE CONTROL">
        <p>DEVICE MANAGEMENT CONSOLE</p>
      </C64Box>

      <div className="mt-[1em]">
        <C64Box title="REGISTER DEVICE">
          <div className="flex flex-col gap-[0.5em]">
            <C64Input
              placeholder="IP ADDRESS"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
            />
            <C64Input
              placeholder="NAME (OPTIONAL)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <C64Input
              placeholder="PASSWORD (OPTIONAL)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
            <div className="flex gap-[1ch]">
              <C64Button
                onClick={handleRegister}
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "REGISTERING..." : "REGISTER"}
              </C64Button>
            </div>
          </div>
        </C64Box>
      </div>

      <div className="mt-[1em]">
        <C64Box title="DEVICES">
          <div className="flex gap-[1ch] mb-[0.5em]">
            <C64Button onClick={() => refetch()}>REFRESH</C64Button>
          </div>

          {isLoading && (
            <p>
              <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
            </p>
          )}
          {isError && (
            <p className="text-c64-2-red">?ERROR LOADING DEVICES</p>
          )}
          {devices && devices.length === 0 && <p>NO DEVICES REGISTERED</p>}
          {devices && devices.length > 0 && (
            <div>
              {/* Table header */}
              <div className="flex bg-c64-14-light-blue text-c64-6-blue">
                <span className="px-[1ch] flex-1">NAME</span>
                <span className="px-[1ch]" style={{ flex: "0 0 16ch" }}>
                  IP
                </span>
                <span className="px-[1ch]" style={{ flex: "0 0 10ch" }}>
                  STATUS
                </span>
                <span className="px-[1ch]" style={{ flex: "0 0 14ch" }}>
                  ACTIONS
                </span>
              </div>
              {/* Device rows */}
              {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center py-[0.25em]"
                  >
                    <span className="px-[1ch] flex-1 truncate">
                      {device.name}
                    </span>
                    <span
                      className="px-[1ch]"
                      style={{ flex: "0 0 16ch" }}
                    >
                      {device.ip}
                    </span>
                    <span
                      className="px-[1ch]"
                      style={{ flex: "0 0 10ch" }}
                    >
                      <C64StatusBadge online={device.online} />
                    </span>
                    <span
                      className="px-[1ch] flex gap-[1ch]"
                      style={{ flex: "0 0 14ch" }}
                    >
                      <Link
                        to="/devices/$deviceId"
                        params={{ deviceId: device.id }}
                        className="c64-button inline-block no-underline"
                      >
                        OPEN
                      </Link>
                      <C64Button
                        variant="danger"
                        onClick={() =>
                          deleteMutation.mutate(device.id, {
                            onSuccess: () =>
                              addToast("DEVICE DELETED", "success"),
                            onError: () =>
                              addToast("DELETE FAILED", "error"),
                          })
                        }
                        disabled={deleteMutation.isPending}
                      >
                        DEL
                      </C64Button>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </C64Box>
      </div>
    </div>
  );
}

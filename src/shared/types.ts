// Shared types between server and client
// Types are primarily inferred via Hono RPC (hc) — add shared types here only when needed beyond RPC inference.

export interface Device {
  id: string; // unique_id from /v1/info (hex string)
  name: string; // user-assigned name, defaults to hostname
  ip: string; // current IP address
  port: number; // HTTP port (default 80)
  password?: string; // X-Password header value if device has auth
  product: string; // "Ultimate 64", "Ultimate II+", etc.
  firmware: string; // firmware version
  fpga: string; // FPGA version
  online: boolean; // last health-check result
  lastSeen: string; // ISO timestamp of last successful contact
}

export interface DeviceRegistration {
  ip: string;
  port?: number;
  password?: string;
  name?: string;
}

export interface DeviceUpdate {
  name?: string;
  password?: string;
  ip?: string;
  port?: number;
}

export interface ScanRequest {
  subnet: string;
}

export interface C64DeviceInfo {
  product: string;
  firmware_version: string;
  fpga_version: string;
  core_version: string;
  hostname: string;
  unique_id: string;
  errors: string[];
}

export interface C64VersionResponse {
  version: string;
  errors: string[];
}

export type DeviceEventType = "device:online" | "device:offline" | "device:discovered";

export interface DeviceEvent {
  type: DeviceEventType;
  data: {
    id: string;
    ip: string;
    product?: string;
  };
}

export type DeviceStateEventType = "state:drives" | "state:info" | "state:offline" | "state:online";

export interface DeviceStateEvent {
  type: DeviceStateEventType;
  deviceId: string;
  data: unknown;
}

// ── Disk Flip Collections ──────────────────────────────

export interface DiskEntry {
  slot: number; // position in collection (0-based)
  label: string; // "Disk 1 - Side A"
  path: string; // "/USB0/Games/ManiacMansion/disk1.d64"
  drive: "a" | "b"; // target drive
  type?: string; // inferred from extension
}

export interface DiskFlipCollection {
  id: string;
  name: string; // "Maniac Mansion", "Ultima IV"
  description?: string;
  disks: DiskEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface FlipResult {
  disk: DiskEntry;
  position: number; // current slot index
  total: number; // total disks in collection
}

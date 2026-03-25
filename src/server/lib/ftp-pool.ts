import { Client } from "basic-ftp";

const IDLE_TIMEOUT_MS = 60_000;
const MAX_CONNECTIONS = 2;

interface PoolEntry {
  client: Client;
  idleTimer: ReturnType<typeof setTimeout> | null;
  inUse: boolean;
}

interface DevicePool {
  entries: PoolEntry[];
  host: string;
  password?: string;
}

export class FtpPool {
  private pools = new Map<string, DevicePool>();

  /** Acquire an FTP connection for a device. Caller MUST call release() when done. */
  async acquire(deviceId: string, host: string, password?: string): Promise<Client> {
    let pool = this.pools.get(deviceId);

    if (!pool) {
      pool = { entries: [], host, password };
      this.pools.set(deviceId, pool);
    }

    // Update credentials if they changed
    pool.host = host;
    pool.password = password;

    // Find an idle connection
    for (const entry of pool.entries) {
      if (!entry.inUse && !entry.client.closed) {
        entry.inUse = true;
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
          entry.idleTimer = null;
        }
        return entry.client;
      }
    }

    // Remove closed connections
    pool.entries = pool.entries.filter((e) => !e.client.closed);

    // Create new connection if under limit
    if (pool.entries.length < MAX_CONNECTIONS) {
      const client = new Client();
      const entry: PoolEntry = { client, idleTimer: null, inUse: true };
      pool.entries.push(entry);

      try {
        await client.access({
          host,
          user: "anonymous",
          password: password ?? "",
          secure: false,
        });
        return client;
      } catch (err) {
        // Remove failed entry
        pool.entries = pool.entries.filter((e) => e !== entry);
        client.close();
        throw err;
      }
    }

    // All connections in use — wait for one to free up (simple retry)
    throw new Error("FTP connection pool exhausted for device " + deviceId);
  }

  /** Release a connection back to the pool. Starts idle timeout. */
  release(deviceId: string, client: Client): void {
    const pool = this.pools.get(deviceId);
    if (!pool) {
      client.close();
      return;
    }

    const entry = pool.entries.find((e) => e.client === client);
    if (!entry) {
      client.close();
      return;
    }

    entry.inUse = false;

    if (client.closed) {
      pool.entries = pool.entries.filter((e) => e !== entry);
      return;
    }

    // Start idle timeout
    entry.idleTimer = setTimeout(() => {
      client.close();
      pool.entries = pool.entries.filter((e) => e !== entry);
      if (pool.entries.length === 0) {
        this.pools.delete(deviceId);
      }
    }, IDLE_TIMEOUT_MS);
  }

  /** Close all connections for a device */
  closeDevice(deviceId: string): void {
    const pool = this.pools.get(deviceId);
    if (!pool) return;

    for (const entry of pool.entries) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.client.close();
    }
    this.pools.delete(deviceId);
  }

  /** Close all connections */
  closeAll(): void {
    for (const deviceId of this.pools.keys()) {
      this.closeDevice(deviceId);
    }
  }
}

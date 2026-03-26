import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock basic-ftp Client before importing FtpPool
const mockAccess = mock(() => Promise.resolve());
const mockClose = mock(() => {});
let mockClosed = false;

mock.module("basic-ftp", () => ({
  Client: class MockClient {
    closed = mockClosed;
    access = mockAccess;
    close() {
      this.closed = true;
      mockClose();
    }
  },
}));

// Import after mocking
const { FtpPool } = await import("../src/server/lib/ftp-pool.ts");

describe("FtpPool", () => {
  let pool: InstanceType<typeof FtpPool>;

  beforeEach(() => {
    pool = new FtpPool();
    mockAccess.mockClear();
    mockClose.mockClear();
    mockClosed = false;
  });

  afterEach(() => {
    pool.closeAll();
  });

  it("acquires a new FTP connection", async () => {
    const client = await pool.acquire("dev1", "192.168.1.10", "pass");
    expect(client).toBeDefined();
    expect(mockAccess).toHaveBeenCalledTimes(1);
    expect(mockAccess).toHaveBeenCalledWith({
      host: "192.168.1.10",
      user: "anonymous",
      password: "pass",
      secure: false,
    });
    pool.release("dev1", client);
  });

  it("reuses idle connections", async () => {
    const client1 = await pool.acquire("dev1", "192.168.1.10");
    pool.release("dev1", client1);

    const client2 = await pool.acquire("dev1", "192.168.1.10");
    // Should reuse the same client — only one access call total
    expect(mockAccess).toHaveBeenCalledTimes(1);
    expect(client2).toBe(client1);
    pool.release("dev1", client2);
  });

  it("uses empty string password when none provided", async () => {
    const client = await pool.acquire("dev1", "192.168.1.10");
    expect(mockAccess).toHaveBeenCalledWith({
      host: "192.168.1.10",
      user: "anonymous",
      password: "",
      secure: false,
    });
    pool.release("dev1", client);
  });

  it("allows up to MAX_CONNECTIONS concurrent connections", async () => {
    const client1 = await pool.acquire("dev1", "192.168.1.10");
    const client2 = await pool.acquire("dev1", "192.168.1.10");
    expect(mockAccess).toHaveBeenCalledTimes(2);

    // Third should throw
    await expect(pool.acquire("dev1", "192.168.1.10")).rejects.toThrow("pool exhausted");

    pool.release("dev1", client1);
    pool.release("dev1", client2);
  });

  it("manages separate pools per device", async () => {
    const c1 = await pool.acquire("dev1", "192.168.1.10");
    const c2 = await pool.acquire("dev2", "192.168.1.20");
    expect(mockAccess).toHaveBeenCalledTimes(2);
    expect(c1).not.toBe(c2);
    pool.release("dev1", c1);
    pool.release("dev2", c2);
  });

  it("closes all connections for a device", async () => {
    const c1 = await pool.acquire("dev1", "192.168.1.10");
    pool.release("dev1", c1);
    pool.closeDevice("dev1");

    // Should need a new connection
    const c2 = await pool.acquire("dev1", "192.168.1.10");
    expect(mockAccess).toHaveBeenCalledTimes(2);
    pool.release("dev1", c2);
  });

  it("closes all connections across all devices", async () => {
    const c1 = await pool.acquire("dev1", "192.168.1.10");
    const c2 = await pool.acquire("dev2", "192.168.1.20");
    pool.release("dev1", c1);
    pool.release("dev2", c2);

    pool.closeAll();

    // Both devices should need new connections
    const c3 = await pool.acquire("dev1", "192.168.1.10");
    const c4 = await pool.acquire("dev2", "192.168.1.20");
    expect(mockAccess).toHaveBeenCalledTimes(4);
    pool.release("dev1", c3);
    pool.release("dev2", c4);
  });

  it("handles connection failure gracefully", async () => {
    mockAccess.mockImplementationOnce(() => Promise.reject(new Error("Connection refused")));

    await expect(pool.acquire("dev1", "192.168.1.10")).rejects.toThrow("Connection refused");

    // Should be able to try again — failed entry cleaned up
    mockAccess.mockImplementation(() => Promise.resolve());
    const client = await pool.acquire("dev1", "192.168.1.10");
    expect(client).toBeDefined();
    pool.release("dev1", client);
  });

  it("releases unknown client by closing it", () => {
    const { Client } = require("basic-ftp");
    const fakeClient = new Client();

    // Should not throw — just closes the client
    pool.release("unknown-device", fakeClient);
    expect(fakeClient.closed).toBe(true);
  });
});

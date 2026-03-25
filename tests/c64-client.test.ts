import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { probeVersion, fetchDeviceInfo } from "../src/server/lib/c64-client.ts";

const originalFetch = globalThis.fetch;

describe("c64-client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("probeVersion", () => {
    it("returns data on success", async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ version: "0.1", errors: [] }), {
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.version).toBe("0.1");
      }
    });

    it("returns error on HTTP 403", async () => {
      globalThis.fetch = mock(async () =>
        new Response("Forbidden", { status: 403 }),
      ) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Authentication");
      }
    });

    it("returns error on non-ok HTTP status", async () => {
      globalThis.fetch = mock(async () =>
        new Response("Error", { status: 500 }),
      ) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("HTTP 500");
      }
    });

    it("returns error on timeout/AbortError", async () => {
      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        // Simulate abort
        const error = new DOMException("The operation was aborted", "AbortError");
        throw error;
      }) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80, undefined, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("timeout");
      }
    });

    it("returns error on ECONNREFUSED", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("connect ECONNREFUSED 192.168.1.42:80");
      }) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Connection refused");
      }
    });

    it("returns error on EHOSTUNREACH", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("connect EHOSTUNREACH 192.168.1.42:80");
      }) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("unreachable");
      }
    });

    it("returns error on ENOTFOUND", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("getaddrinfo ENOTFOUND badhost");
      }) as typeof fetch;

      const result = await probeVersion("badhost", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Cannot resolve");
      }
    });

    it("returns generic error for unknown exceptions", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("something weird happened");
      }) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Cannot connect");
        expect(result.reason).toContain("something weird happened");
      }
    });

    it("sends X-Password header when password provided", async () => {
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedHeaders = headers ?? {};
        return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      await probeVersion("192.168.1.42", 80, "secret123");
      expect(capturedHeaders["X-Password"]).toBe("secret123");
    });

    it("does not send X-Password header without password", async () => {
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedHeaders = headers ?? {};
        return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      await probeVersion("192.168.1.42", 80);
      expect(capturedHeaders["X-Password"]).toBeUndefined();
    });

    it("returns error when response contains errors array", async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ version: "0.1", errors: ["Device busy", "Try later"] }), {
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch;

      const result = await probeVersion("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Device busy");
        expect(result.reason).toContain("Try later");
      }
    });
  });

  describe("fetchDeviceInfo", () => {
    it("returns device info on success", async () => {
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            product: "Ultimate 64",
            firmware_version: "3.12",
            fpga_version: "11F",
            core_version: "143",
            hostname: "TestDevice",
            unique_id: "8D927F",
            errors: [],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ) as typeof fetch;

      const result = await fetchDeviceInfo("192.168.1.42", 80);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.product).toBe("Ultimate 64");
        expect(result.data.unique_id).toBe("8D927F");
      }
    });

    it("returns error on HTTP 403", async () => {
      globalThis.fetch = mock(async () =>
        new Response("Forbidden", { status: 403 }),
      ) as typeof fetch;

      const result = await fetchDeviceInfo("192.168.1.42", 80);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Authentication");
      }
    });

    it("handles timeout with default 5000ms", async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      }) as typeof fetch;

      const result = await fetchDeviceInfo("192.168.1.42", 80, undefined, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("timeout");
      }
    });
  });
});

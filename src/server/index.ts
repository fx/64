import { Hono } from "hono";
import health from "./routes/health.ts";
import { createDeviceRoutes } from "./routes/devices.ts";
import { createEventRoutes } from "./routes/events.ts";
import { createProxyRoutes } from "./routes/proxy.ts";
import { createUploadMountRoutes } from "./routes/upload-mount.ts";
import { createFileRoutes } from "./routes/files.ts";
import { DeviceStore } from "./lib/device-store.ts";
import { DevicePoller } from "./lib/device-poller.ts";
import { startHealthChecker } from "./lib/health-checker.ts";
import { cors } from "./middleware/cors.ts";

const store = new DeviceStore();
const poller = new DevicePoller(store);

const deviceRoutes = createDeviceRoutes(store);
const eventRoutes = createEventRoutes(store, poller);
const uploadMountRoutes = createUploadMountRoutes(store);
const fileRoutes = createFileRoutes(store);
const proxyRoutes = createProxyRoutes(store);

const app = new Hono();

app.use("/api/*", cors);

const apiRoutes = app
  .basePath("/api")
  .route("/", health)
  .route("/", deviceRoutes)
  .route("/", eventRoutes)
  .route("/", uploadMountRoutes)
  .route("/", fileRoutes)
  .route("/", proxyRoutes);

export type AppType = typeof apiRoutes;

// Static file serving — only in production (Bun runtime).
// In dev mode, Vite serves static files directly.
if (typeof globalThis.Bun !== "undefined") {
  const { serveStatic } = await import("hono/bun");
  app.use("/static/*", serveStatic({ root: "./dist" }));
  app.use("/fonts/*", serveStatic({ root: "./public" }));
  app.use("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));

  app.notFound(async (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/")) {
      return c.json({ errors: ["Not found"], proxy_error: false }, 404);
    }
    if (path.startsWith("/static/") || path.startsWith("/fonts/") || path === "/favicon.ico") {
      return c.notFound();
    }
    return serveStatic({ path: "./dist/static/index.html" })(c, async () => {});
  });
}

// Start health checker and device poller in background
startHealthChecker(store);
poller.start();

export default app;

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import health from "./routes/health.ts";
import { createDeviceRoutes } from "./routes/devices.ts";
import { createEventRoutes } from "./routes/events.ts";
import { createProxyRoutes } from "./routes/proxy.ts";
import { DeviceStore } from "./lib/device-store.ts";
import { startHealthChecker } from "./lib/health-checker.ts";
import { cors } from "./middleware/cors.ts";

const store = new DeviceStore();

const deviceRoutes = createDeviceRoutes(store);
const eventRoutes = createEventRoutes(store);
const proxyRoutes = createProxyRoutes(store);

const app = new Hono();

app.use("/api/*", cors);

const apiRoutes = app
  .basePath("/api")
  .route("/", health)
  .route("/", deviceRoutes)
  .route("/", eventRoutes)
  .route("/", proxyRoutes);

export type AppType = typeof apiRoutes;

app.use("/static/*", serveStatic({ root: "./dist" }));
app.use("/fonts/*", serveStatic({ root: "./public" }));
app.use("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));

app.notFound(async (c) => {
  const path = c.req.path;
  if (path.startsWith("/static/") || path.startsWith("/fonts/") || path === "/favicon.ico") {
    return c.notFound();
  }
  return serveStatic({ path: "./dist/static/index.html" })(c, async () => {});
});

// Start health checker in background
startHealthChecker(store);

export default app;

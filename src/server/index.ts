import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import health from "./routes/health.ts";
import { createDeviceRoutes } from "./routes/devices.ts";
import { createEventRoutes } from "./routes/events.ts";
import { DeviceStore } from "./lib/device-store.ts";
import { startHealthChecker } from "./lib/health-checker.ts";

const store = new DeviceStore();

const deviceRoutes = createDeviceRoutes(store);
const eventRoutes = createEventRoutes(store);

const app = new Hono();

const apiRoutes = app
  .basePath("/api")
  .route("/", health)
  .route("/", deviceRoutes)
  .route("/", eventRoutes);

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

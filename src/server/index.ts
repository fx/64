import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import health from "./routes/health.ts";

const app = new Hono();

// API routes
const apiRoutes = app.basePath("/api").route("/", health);

export type AppType = typeof apiRoutes;

// Production static file serving
app.use("/static/*", serveStatic({ root: "./dist" }));
app.use("/fonts/*", serveStatic({ root: "./public" }));
app.use("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));

// SPA fallback — serve index.html for all non-API routes
app.get("*", serveStatic({ path: "./dist/static/index.html" }));

export default app;

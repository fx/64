import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import health from "./routes/health.ts";

const app = new Hono();

const apiRoutes = app.basePath("/api").route("/", health);

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

export default app;

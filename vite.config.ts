import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import build from "@hono/vite-build/bun";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  if (mode === "client") {
    return {
      build: {
        outDir: "dist/static",
        rollupOptions: {
          input: "./index.html",
        },
      },
      plugins: [
        tailwindcss(),
        TanStackRouterVite({
          routesDirectory: "./src/client/routes",
          generatedRouteTree: "./src/client/routeTree.gen.ts",
        }),
      ],
    };
  }

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
    plugins: [
      devServer({
        entry: "src/server/index.ts",
        exclude: [
          // Only route /api/* to Hono; Vite handles everything else (SPA, assets, HMR)
          /^(?!\/api\/).*/,
        ],
      }),
      tailwindcss(),
      TanStackRouterVite({
        routesDirectory: "./src/client/routes",
        generatedRouteTree: "./src/client/routeTree.gen.ts",
      }),
      build({
        entry: "src/server/index.ts",
        output: "index.js",
      }),
    ],
  };
});

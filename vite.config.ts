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
    plugins: [
      devServer({
        entry: "src/server/index.ts",
        exclude: [
          /^\/@.+$/,
          /.*\.(ts|tsx|css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/,
          /^\/node_modules\/.*/,
          /^\/src\/client\/.*/,
          /^\/public\/.*/,
          /^\/fonts\/.*/,
          /^\/__vite.*/,
          /^\/favicon\.ico$/,
        ],
      }),
      tailwindcss(),
      TanStackRouterVite({
        routesDirectory: "./src/client/routes",
        generatedRouteTree: "./src/client/routeTree.gen.ts",
      }),
      build({
        entry: "src/server/index.ts",
        output: "dist/index.js",
      }),
    ],
  };
});

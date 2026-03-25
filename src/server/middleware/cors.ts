import type { MiddlewareHandler } from "hono";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Password",
} as const;

/** CORS middleware — adds headers to all responses and handles OPTIONS preflight */
export const cors: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  await next();

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    c.res.headers.set(key, value);
  }
};

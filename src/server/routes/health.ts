import { Hono } from "hono";

const health = new Hono().get("/health", (c) => {
  return c.json({ status: "ok" });
});

export type HealthRoute = typeof health;
export default health;

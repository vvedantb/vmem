import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { memories } from "./routes/memories";
import { proposedUpdates } from "./routes/proposed-updates";

const app = new Hono().basePath("/v1");

app.use("*", logger());
app.use("*", cors());

app.route("/memories", memories);
app.route("/proposed-updates", proposedUpdates);

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`vmem api running on http://localhost:${port}`);
});

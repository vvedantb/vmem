import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { memories } from "./routes/memories";
import { proposedUpdates } from "./routes/proposed-updates";
import { dashboard } from "./routes/dashboard";
import { getDriver, closeDriver } from "./db/neo4j";
import { setupDatabase } from "./db/setup";

const app = new Hono().basePath("/v1");

app.use("*", logger());
app.use("*", cors());

app.route("/memories", memories);
app.route("/proposed-updates", proposedUpdates);
app.route("/dashboard", dashboard);

app.get("/health", async (c) => {
  const driver = getDriver();
  const serverInfo = await driver.getServerInfo();
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    neo4j: serverInfo.address,
  });
});

const port = Number(process.env.PORT ?? 3001);

const shutdown = async () => {
  await closeDriver();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve({ fetch: app.fetch, port }, async () => {
  console.log(`vmem api running on http://localhost:${port}`);
  await setupDatabase(getDriver());
});

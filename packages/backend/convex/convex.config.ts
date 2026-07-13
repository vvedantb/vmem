import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import actionCache from "@convex-dev/action-cache/convex.config";
import crons from "@convex-dev/crons/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import auditLog from "convex-audit-log/convex.config";

const app = defineApp();
app.use(actionRetrier);
app.use(actionCache);
app.use(crons);
app.use(workflow);
app.use(auditLog);

export default app;

import { Hono } from "hono";

const proposedUpdates = new Hono();

proposedUpdates.get("/", (c) => {
  return c.json({ message: "GET /proposed-updates" });
});

proposedUpdates.post("/:id/approve", (c) => {
  return c.json({
    message: `POST /proposed-updates/${c.req.param("id")}/approve`,
  });
});

proposedUpdates.post("/:id/reject", (c) => {
  return c.json({
    message: `POST /proposed-updates/${c.req.param("id")}/reject`,
  });
});

export { proposedUpdates };

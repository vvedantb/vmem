import { Hono } from "hono";

const memories = new Hono();

memories.get("/", (c) => {
  return c.json({ message: "GET /memories" });
});

memories.post("/", (c) => {
  return c.json({ message: "POST /memories" });
});

memories.get("/:id", (c) => {
  return c.json({ message: `GET /memories/${c.req.param("id")}` });
});

memories.patch("/:id", (c) => {
  return c.json({ message: `PATCH /memories/${c.req.param("id")}` });
});

memories.delete("/:id", (c) => {
  return c.json({ message: `DELETE /memories/${c.req.param("id")}` });
});

memories.post("/search", (c) => {
  return c.json({ message: "POST /memories/search" });
});

memories.post("/retrieve", (c) => {
  return c.json({ message: "POST /memories/retrieve" });
});

memories.get("/:id/events", (c) => {
  return c.json({ message: `GET /memories/${c.req.param("id")}/events` });
});

export { memories };

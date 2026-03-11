import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../db/neo4j", () => ({
  getDriver: vi.fn(),
}));

const mockListProposedUpdates = vi.fn().mockResolvedValue([]);
const mockResolveProposal = vi.fn().mockResolvedValue(null);

vi.mock("../../db/memory-service", () => ({
  MemoryService: class {
    listProposedUpdates = mockListProposedUpdates;
    resolveProposal = mockResolveProposal;
  },
}));

const { proposedUpdates } = await import("../proposed-updates.js");

const app = new Hono();
app.route("/proposed-updates", proposedUpdates);

describe("proposed-updates routes", () => {
  describe("GET /proposed-updates - validation", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/proposed-updates");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("userId query param required");
    });

    it("returns 200 with userId", async () => {
      const res = await app.request("/proposed-updates?userId=user-1");
      expect(res.status).toBe(200);
    });
  });

  describe("POST /proposed-updates/:id/approve - authorization", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/proposed-updates/proposal-1/approve", {
        method: "POST",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("userId query param required");
    });

    it("returns 404 when proposal not found for user", async () => {
      const res = await app.request(
        "/proposed-updates/nonexistent/approve?userId=user-1",
        { method: "POST" },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /proposed-updates/:id/reject - authorization", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/proposed-updates/proposal-1/reject", {
        method: "POST",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("userId query param required");
    });

    it("returns 404 when proposal not found for user", async () => {
      const res = await app.request(
        "/proposed-updates/nonexistent/reject?userId=user-1",
        { method: "POST" },
      );
      expect(res.status).toBe(404);
    });
  });
});

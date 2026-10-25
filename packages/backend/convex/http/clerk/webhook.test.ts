/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../schema";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@clerk/backend/webhooks", () => ({ verifyWebhook: verify }));

const modules = import.meta.glob("../../**/*.ts");

async function slugsOf(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const user = await ctx.db.query("users").first();
    return user?.planSlugs;
  });
}

function item(status: string, slug: string) {
  return { status, plan: { slug } };
}

describe("POST /clerk/webhooks", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    verify.mockReset();
  });

  it("answers 400 when the signing secret is missing", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    const t = convexTest(schema, modules);
    const res = await t.fetch("/clerk/webhooks", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("answers 400 when verification fails", async () => {
    verify.mockRejectedValue(new Error("bad signature"));
    const t = convexTest(schema, modules);
    const res = await t.fetch("/clerk/webhooks", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("replaces slugs from a subscription event", async () => {
    verify.mockResolvedValue({
      type: "subscription.active",
      data: {
        payer: { user_id: "user_a" },
        items: [item("active", "v_pro"), item("canceled", "old")],
      },
    });
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_a", planSlugs: ["old"] });
    });
    const res = await t.fetch("/clerk/webhooks", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await slugsOf(t)).toEqual(["v_pro"]);
  });

  it("removes a slug on subscriptionItem.ended", async () => {
    verify.mockResolvedValue({
      type: "subscriptionItem.ended",
      data: {
        payer: { user_id: "user_a" },
        status: "ended",
        plan: { slug: "v_pro" },
      },
    });
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_a", planSlugs: ["v_pro"] });
    });
    const res = await t.fetch("/clerk/webhooks", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await slugsOf(t)).toEqual([]);
  });

  it("ignores organisation payers and unrelated events", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_a", planSlugs: ["v_pro"] });
    });
    verify.mockResolvedValueOnce({
      type: "subscriptionItem.ended",
      data: {
        payer: { organization_id: "org_1" },
        status: "ended",
        plan: { slug: "v_pro" },
      },
    });
    expect(
      (await t.fetch("/clerk/webhooks", { method: "POST", body: "{}" })).status,
    ).toBe(200);
    verify.mockResolvedValueOnce({ type: "user.created", data: {} });
    expect(
      (await t.fetch("/clerk/webhooks", { method: "POST", body: "{}" })).status,
    ).toBe(200);
    expect(await slugsOf(t)).toEqual(["v_pro"]);
  });
});

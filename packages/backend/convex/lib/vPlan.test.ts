import { describe, expect, it } from "vitest";
import {
  applyItemToPlanSlugs,
  identityHasVPlan,
  isVProCompUser,
  parseVProCompUserIds,
  planSlugsFromItems,
  userHasVPlan,
} from "./vPlan";

describe("userHasVPlan", () => {
  it("is false without a user, slugs or a Pro slug", () => {
    expect(userHasVPlan(null)).toBe(false);
    expect(userHasVPlan({})).toBe(false);
    expect(userHasVPlan({ planSlugs: [] })).toBe(false);
    expect(userHasVPlan({ planSlugs: ["other"] })).toBe(false);
  });

  it("is true for v_pro and the legacy vibot_pro slug", () => {
    expect(userHasVPlan({ planSlugs: ["v_pro"] })).toBe(true);
    expect(userHasVPlan({ planSlugs: ["other", "vibot_pro"] })).toBe(true);
  });
});

describe("parseVProCompUserIds", () => {
  it("trims and drops empties", () => {
    expect(parseVProCompUserIds(" user_a, ,user_b ,")).toEqual([
      "user_a",
      "user_b",
    ]);
  });

  it("is empty for unset or blank", () => {
    expect(parseVProCompUserIds(undefined)).toEqual([]);
    expect(parseVProCompUserIds("  ")).toEqual([]);
  });
});

describe("isVProCompUser and the allowlist in userHasVPlan", () => {
  const env = { V_PRO_COMP_USER_IDS: "user_a, user_b" };

  it("matches listed ids only", () => {
    expect(isVProCompUser("user_b", env)).toBe(true);
    expect(isVProCompUser("user_c", env)).toBe(false);
  });

  it("makes a listed user Pro without a plan slug", () => {
    expect(userHasVPlan({ clerkId: "user_a" }, env)).toBe(true);
    expect(userHasVPlan({ clerkId: "user_a", planSlugs: [] }, env)).toBe(true);
  });

  it("keeps an unlisted user Free unless a paid slug exists", () => {
    expect(userHasVPlan({ clerkId: "user_c", planSlugs: [] }, env)).toBe(false);
    expect(userHasVPlan({ clerkId: "user_c", planSlugs: ["v_pro"] }, env)).toBe(
      true,
    );
    expect(userHasVPlan({ planSlugs: [] }, env)).toBe(false);
  });

  it("grants nobody when the env is unset or empty", () => {
    expect(userHasVPlan({ clerkId: "user_a" }, {})).toBe(false);
    expect(
      userHasVPlan({ clerkId: "user_a" }, { V_PRO_COMP_USER_IDS: "" }),
    ).toBe(false);
  });
});

describe("identityHasVPlan", () => {
  it("is false for no identity", () => {
    expect(identityHasVPlan(null)).toBe(false);
  });
});

describe("planSlugsFromItems", () => {
  it("keeps active, past due and canceled (period not ended), unique and sorted", () => {
    expect(
      planSlugsFromItems([
        { status: "active", plan: { slug: "v_pro" } },
        { status: "active", plan: { slug: "v_pro" } },
        { status: "past_due", plan: { slug: "extra" } },
        { status: "canceled", plan: { slug: "kept" } },
        { status: "ended", plan: { slug: "gone2" } },
        { status: "upcoming", plan: { slug: "later" } },
        { status: "active", plan: null },
        { status: "active" },
      ]),
    ).toEqual(["extra", "kept", "v_pro"]);
  });

  it("is empty for no items", () => {
    expect(planSlugsFromItems([])).toEqual([]);
  });
});

describe("applyItemToPlanSlugs", () => {
  it("adds a slug for an active item and is idempotent", () => {
    const item = { status: "active", plan: { slug: "v_pro" } };
    const once = applyItemToPlanSlugs(["other"], item);
    expect(once).toEqual(["other", "v_pro"]);
    expect(applyItemToPlanSlugs(once, item)).toEqual(once);
  });

  it("keeps the slug for a canceled item (access until period end)", () => {
    expect(
      applyItemToPlanSlugs(["other", "v_pro"], {
        status: "canceled",
        plan: { slug: "v_pro" },
      }),
    ).toEqual(["other", "v_pro"]);
  });

  it.each(["ended", "expired", "abandoned", "incomplete"])(
    "removes the slug for a %s item",
    (status) => {
      expect(
        applyItemToPlanSlugs(["other", "v_pro"], {
          status,
          plan: { slug: "v_pro" },
        }),
      ).toEqual(["other"]);
    },
  );

  it("keeps the slugs when the item has no plan", () => {
    expect(applyItemToPlanSlugs(["v_pro"], { status: "ended" })).toEqual([
      "v_pro",
    ]);
  });
});

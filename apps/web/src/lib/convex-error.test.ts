import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { convexErrorMessage } from "./convex-error";

describe("convexErrorMessage", () => {
  it("prefers ConvexError data", () => {
    expect(
      convexErrorMessage(
        new ConvexError("No vmem account for that email"),
        "Failed to add member",
      ),
    ).toBe("No vmem account for that email");
  });

  it("unwraps JSON-encoded ConvexError string payloads", () => {
    expect(
      convexErrorMessage(
        new ConvexError('"No vmem account for that email"'),
        "Failed to add member",
      ),
    ).toBe("No vmem account for that email");
  });

  it("extracts the uncaught Error suffix from Convex wrappers", () => {
    expect(
      convexErrorMessage(
        new Error(
          "[CONVEX M(teams:addMember)] [Request ID: abc] Server Error\nUncaught Error: User is already a member of this team",
        ),
        "Failed to add member",
      ),
    ).toBe("User is already a member of this team");
  });

  it("does not show production Convex request-id wrappers", () => {
    expect(
      convexErrorMessage(
        new Error(
          "[CONVEX M(teams:addMember)] [Request ID: 522dj8d3bv2n914r0] Server Error Called by client",
        ),
        "Failed to add member",
      ),
    ).toBe("Failed to add member");
  });
});

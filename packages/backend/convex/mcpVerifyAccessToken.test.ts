/// <reference types="vite/client" />
// Pins verifyAccessToken: return values, the Clerk request and every console.error line.
import { convexTest } from "convex-test";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

type FakeAuth = {
  isAuthenticated: boolean;
  tokenType: string | null;
  userId?: string | null;
};

type FakeState =
  | { isAuthenticated: true; toAuth: () => FakeAuth }
  | { isAuthenticated: false; reason: string | null; message: string | null };

type AuthenticateCall = {
  url: string;
  authorization: string | null;
  acceptsToken: string[];
};

const clerk = vi.hoisted(() => {
  const created: Array<{ secretKey: string; publishableKey: string }> = [];
  const calls: AuthenticateCall[] = [];
  const state: { next: () => Promise<FakeState> } = {
    next: () => Promise.reject(new Error("no fake state set")),
  };
  return { created, calls, state };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: (options: {
    secretKey: string;
    publishableKey: string;
  }) => {
    clerk.created.push(options);
    return {
      authenticateRequest: (
        request: Request,
        opts: { acceptsToken: string[] },
      ) => {
        clerk.calls.push({
          url: request.url,
          authorization: request.headers.get("Authorization"),
          acceptsToken: opts.acceptsToken,
        });
        return clerk.state.next();
      },
    };
  },
}));

const modules = import.meta.glob("./**/*.ts");

function authenticated(auth: FakeAuth): () => Promise<FakeState> {
  return () => Promise.resolve({ isAuthenticated: true, toAuth: () => auth });
}

async function verify(token = "tok_123") {
  const t = convexTest(schema, modules);
  return t.action(internal.mcp.nodeActions.verifyAccessToken, { token });
}

let errors: MockInstance<typeof console.error>;

beforeEach(() => {
  clerk.created.length = 0;
  clerk.calls.length = 0;
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", "pk_test_fake");
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifyAccessToken", () => {
  it.each(["oauth_token", "session_token"])(
    "returns the Clerk user for %s",
    async (tokenType) => {
      clerk.state.next = authenticated({
        isAuthenticated: true,
        tokenType,
        userId: "user_abc",
      });
      expect(await verify("tok_123")).toEqual({ clerkUserId: "user_abc" });
      expect(clerk.created).toEqual([
        { secretKey: "sk_test_fake", publishableKey: "pk_test_fake" },
      ]);
      expect(clerk.calls).toEqual([
        {
          url: "https://mcp.local/",
          authorization: "Bearer tok_123",
          acceptsToken: ["oauth_token", "session_token"],
        },
      ]);
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it("logs reason and message for an unauthenticated state", async () => {
    clerk.state.next = () =>
      Promise.resolve({
        isAuthenticated: false,
        reason: "token-invalid",
        message: "Token is expired",
      });
    expect(await verify()).toBeNull();
    expect(errors.mock.calls).toEqual([
      [
        "[MCP][verifyAccessToken] authenticateRequest failed:",
        "token-invalid",
        "Token is expired",
      ],
    ]);
  });

  it("logs null reason and message as null", async () => {
    clerk.state.next = () =>
      Promise.resolve({ isAuthenticated: false, reason: null, message: null });
    expect(await verify()).toBeNull();
    expect(errors.mock.calls).toEqual([
      ["[MCP][verifyAccessToken] authenticateRequest failed:", null, null],
    ]);
  });

  it.each<[string, FakeAuth]>([
    [
      "unauthenticated toAuth",
      { isAuthenticated: false, tokenType: "oauth_token", userId: "user_abc" },
    ],
    [
      "api_key token type",
      { isAuthenticated: true, tokenType: "api_key", userId: "user_abc" },
    ],
    [
      "m2m_token token type",
      { isAuthenticated: true, tokenType: "m2m_token", userId: "user_abc" },
    ],
    [
      "null token type",
      { isAuthenticated: true, tokenType: null, userId: "user_abc" },
    ],
    [
      "null userId",
      { isAuthenticated: true, tokenType: "oauth_token", userId: null },
    ],
    [
      "empty userId",
      { isAuthenticated: true, tokenType: "session_token", userId: "" },
    ],
    ["missing userId", { isAuthenticated: true, tokenType: "oauth_token" }],
  ])("returns null silently for %s", async (_label, auth) => {
    clerk.state.next = authenticated(auth);
    expect(await verify()).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it("logs the message when Clerk throws an Error", async () => {
    clerk.state.next = () => Promise.reject(new Error("JWKS fetch failed"));
    expect(await verify()).toBeNull();
    expect(errors.mock.calls).toEqual([
      ["[MCP][verifyAccessToken] threw:", "JWKS fetch failed"],
    ]);
  });

  it("logs the raw value when Clerk throws a non-Error", async () => {
    clerk.state.next = () => Promise.reject("boom");
    expect(await verify()).toBeNull();
    expect(errors.mock.calls).toEqual([
      ["[MCP][verifyAccessToken] threw:", "boom"],
    ]);
  });

  it("logs and returns null when Clerk env is missing", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await verify()).toBeNull();
    expect(clerk.created).toEqual([]);
    expect(clerk.calls).toEqual([]);
    expect(errors.mock.calls).toEqual([
      [
        "[MCP][verifyAccessToken] threw:",
        "CLERK_SECRET_KEY is not set in Convex env",
      ],
    ]);
  });
});

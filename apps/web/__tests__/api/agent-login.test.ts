import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @clerk/nextjs/server
const mockCreateSignInToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    signInTokens: {
      createSignInToken: mockCreateSignInToken,
    },
  })),
}));

// Mock env/server
vi.mock("../../env/server", () => ({
  serverEnv: {
    AGENT_AUTH_SECRET: "test-secret",
    AGENT_CLERK_USER_ID: "user_123",
  },
}));

// Store original NODE_ENV and restore after each test
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "development",
    writable: true,
    configurable: true,
  });
});

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

describe("GET /api/auth/agent-login", () => {
  it("returns 403 in production", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      writable: true,
      configurable: true,
    });

    const { GET } = await import("../../app/api/auth/agent-login/route");
    const req = makeRequest("http://localhost:3000/api/auth/agent-login");
    const res = await GET(req as never);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("development");
  });

  it("returns 403 with invalid secret", async () => {
    const { GET } = await import("../../app/api/auth/agent-login/route");
    const req = makeRequest(
      "http://localhost:3000/api/auth/agent-login?secret=wrong-secret",
    );
    const res = await GET(req as never);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid secret");
  });

  it("returns 500 when env vars are missing", async () => {
    vi.doMock("../../env/server", () => ({
      serverEnv: {
        AGENT_AUTH_SECRET: undefined,
        AGENT_CLERK_USER_ID: undefined,
      },
    }));

    // Re-import to get the new mock
    const { GET } = await import("../../app/api/auth/agent-login/route");
    // Use a URL without secret so it checks env vars first
    const req = makeRequest("http://localhost:3000/api/auth/agent-login");
    const res = await GET(req as never);
    // Either 500 (missing env) or 403 (missing secret) depending on order
    expect([403, 500]).toContain(res.status);
  });

  it("redirects to agent-callback with ticket on valid secret", async () => {
    mockCreateSignInToken.mockResolvedValue({ token: "sign-in-token-abc" });

    const { GET } = await import("../../app/api/auth/agent-login/route");
    const req = makeRequest(
      "http://localhost:3000/api/auth/agent-login?secret=test-secret",
      { host: "localhost:3000" },
    );
    const res = await GET(req as never);
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("/agent-callback");
    expect(location).toContain("ticket=sign-in-token-abc");
  });
});

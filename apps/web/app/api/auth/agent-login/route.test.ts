import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Clerk client
const mockCreateSignInToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({
    signInTokens: {
      createSignInToken: mockCreateSignInToken,
    },
  }),
}));

// Mock server env
vi.mock("@/env/server", () => ({
  serverEnv: {
    AGENT_AUTH_SECRET: "test-secret-abc",
    AGENT_CLERK_USER_ID: "user_agent123",
  },
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "development",
    writable: true,
    configurable: true,
  });
});

function makeRequest(
  secret: string | null,
  headers: Record<string, string> = {},
): NextRequest {
  const url = secret
    ? `http://localhost:3000/api/auth/agent-login?secret=${secret}`
    : "http://localhost:3000/api/auth/agent-login";
  return new NextRequest(url, { headers });
}

describe("GET /api/auth/agent-login", () => {
  it("returns 403 when not in development", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      writable: true,
      configurable: true,
    });

    const req = makeRequest("test-secret-abc");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/development/i);
  });

  it("returns 403 when secret is missing", async () => {
    const req = makeRequest(null);
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/invalid secret/i);
  });

  it("returns 403 when secret is wrong", async () => {
    const req = makeRequest("wrong-secret");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/invalid secret/i);
  });

  it("creates sign-in token and redirects with valid secret", async () => {
    mockCreateSignInToken.mockResolvedValue({ token: "clerk-token-xyz" });

    const req = makeRequest("test-secret-abc");
    const res = await GET(req);

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("/agent-callback");
    expect(location).toContain("ticket=clerk-token-xyz");
    expect(mockCreateSignInToken).toHaveBeenCalledWith({
      userId: "user_agent123",
      expiresInSeconds: 60,
    });
  });

  it("uses https protocol when x-forwarded-proto is https", async () => {
    mockCreateSignInToken.mockResolvedValue({ token: "clerk-token-xyz" });

    const req = makeRequest("test-secret-abc", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "example.com",
    });
    const res = await GET(req);

    const location = res.headers.get("location");
    expect(location).toMatch(/^https:\/\/example\.com/);
  });

  it("sanitizes invalid proto header to https", async () => {
    mockCreateSignInToken.mockResolvedValue({ token: "clerk-token-xyz" });

    const req = makeRequest("test-secret-abc", {
      "x-forwarded-proto": "javascript",
      "x-forwarded-host": "example.com",
    });
    const res = await GET(req);

    // Should fall back to https not javascript
    const location = res.headers.get("location");
    expect(location).toMatch(/^https:\/\//);
  });
});

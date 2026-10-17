import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TYPESAFE_JEV_MODEL,
  TYPESAFE_SYSTEMONE_URL,
  readTypesafeApiKey,
  scoreMemoryUsefulness,
} from "../../engine/llm/typesafeSystemOne";

const memory = {
  title: "Prefers pnpm",
  content: "x".repeat(3_000),
  source: "mcp",
  sourceType: "mcp",
  tags: ["tooling"],
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("scoreMemoryUsefulness", () => {
  it("posts the question map with Bearer auth and normalises the score", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ answers: { useful: { type: "score", score: 2.1 } } }),
    );
    const quality = await scoreMemoryUsefulness({
      apiKey: " tsk_test ",
      memory,
      fetchImpl,
    });
    expect(quality).toBeCloseTo(0.7, 10);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(TYPESAFE_SYSTEMONE_URL).toBe(url);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer tsk_test",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("jev-1.14.0");
    expect(TYPESAFE_JEV_MODEL).toBe("jev-1.14.0");
    expect(body.questions.useful.type).toBe("score");
    expect(body.questions.useful.criteria).toHaveLength(4);
    expect(body.state.content).toHaveLength(1_500);
    expect(body.state.tags).toEqual(["tooling"]);
  });

  it("clamps out-of-range scores", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ answers: { useful: { type: "score", score: 9 } } }),
    );
    expect(
      await scoreMemoryUsefulness({ apiKey: "k", memory, fetchImpl }),
    ).toBe(1);
  });

  it("skips when the key is missing or blank", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await scoreMemoryUsefulness({ apiKey: undefined, memory, fetchImpl }),
    ).toBeUndefined();
    expect(
      await scoreMemoryUsefulness({ apiKey: "  ", memory, fetchImpl }),
    ).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails open on 401, 500, bad JSON shape and network errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const fetchImpl of [
      vi.fn<typeof fetch>(async () => jsonResponse({}, 401)),
      vi.fn<typeof fetch>(async () => jsonResponse({}, 500)),
      vi.fn<typeof fetch>(async () => jsonResponse({ answers: {} })),
      vi.fn<typeof fetch>(async () => {
        throw new Error("network down");
      }),
    ]) {
      expect(
        await scoreMemoryUsefulness({ apiKey: "k", memory, fetchImpl }),
      ).toBeUndefined();
    }
  });
});

describe("readTypesafeApiKey", () => {
  it("reads TYPESAFE_API_KEY and treats blank as missing", () => {
    vi.stubEnv("TYPESAFE_API_KEY", " abc ");
    expect(readTypesafeApiKey()).toBe("abc");
    vi.stubEnv("TYPESAFE_API_KEY", "  ");
    expect(readTypesafeApiKey()).toBeUndefined();
  });
});

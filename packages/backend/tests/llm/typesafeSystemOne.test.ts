import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
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

const requestBodySchema = z.object({
  model: z.string(),
  state: z.object({
    content: z.string(),
    tags: z.array(z.string()),
  }),
  questions: z.object({
    useful: z.object({
      type: z.string(),
      criteria: z.array(z.string()),
    }),
  }),
});

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
    expect(quality.status).toBe("ok");
    expect(quality.status === "ok" ? quality.quality : -1).toBeCloseTo(0.7, 10);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(TYPESAFE_SYSTEMONE_URL).toBe(url);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer tsk_test",
      "Content-Type": "application/json",
    });
    const body = requestBodySchema.parse(await new Response(init?.body).json());
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
    ).toEqual({ status: "ok", quality: 1 });
  });

  it("skips when the key is missing or blank", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await scoreMemoryUsefulness({ apiKey: undefined, memory, fetchImpl }),
    ).toEqual({ status: "skipped" });
    expect(
      await scoreMemoryUsefulness({ apiKey: "  ", memory, fetchImpl }),
    ).toEqual({ status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports 401 and 403 as auth errors so the batch can stop", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const httpStatus of [401, 403]) {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        jsonResponse({}, httpStatus),
      );
      expect(
        await scoreMemoryUsefulness({ apiKey: "k", memory, fetchImpl }),
      ).toEqual({ status: "auth_error", httpStatus });
    }
  });

  it("fails open on 500, bad JSON shape and network errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cases = [
      {
        fetchImpl: vi.fn<typeof fetch>(async () => jsonResponse({}, 500)),
        expected: { status: "failed", httpStatus: 500 },
      },
      {
        fetchImpl: vi.fn<typeof fetch>(async () =>
          jsonResponse({ answers: {} }),
        ),
        expected: { status: "failed" },
      },
      {
        fetchImpl: vi.fn<typeof fetch>(async () => {
          throw new Error("network down");
        }),
        expected: { status: "failed" },
      },
    ];
    for (const { fetchImpl, expected } of cases) {
      expect(
        await scoreMemoryUsefulness({ apiKey: "k", memory, fetchImpl }),
      ).toEqual(expected);
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

import type { Fixture } from "./fixture.ts";

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface SeedConfig {
  siteUrl: string;
  apiKey: string;
}

// Fail closed: throws with a clear message when the live seed cannot run.
export function resolveSeedConfig(
  env: Record<string, string | undefined> = process.env,
): SeedConfig {
  const apiKey = env.VMEM_API_KEY?.trim();
  const siteUrl = (env.CONVEX_SITE_URL ?? env.VMEM_SITE_URL)?.trim();
  if (!apiKey || !siteUrl) {
    throw new Error(
      "Seeding needs VMEM_API_KEY and CONVEX_SITE_URL (or VMEM_SITE_URL). Nothing was sent.",
    );
  }
  return { siteUrl: siteUrl.replace(/\/+$/, ""), apiKey };
}

export function fixtureTag(fixtureId: string): string {
  return `e2e-ab:${fixtureId}`;
}

// POST oldest first, so createdAt ordering becomes insertion order.
export async function seedFixture(
  fixture: Fixture,
  config: SeedConfig,
  fetchImpl: FetchLike,
): Promise<number> {
  const ordered = fixture.seedMemories
    .map((memory, index) => ({ memory, index }))
    .sort(
      (a, b) =>
        (a.memory.createdAt ?? "").localeCompare(b.memory.createdAt ?? "") ||
        a.index - b.index,
    );
  for (const { memory, index } of ordered) {
    const response = await fetchImpl(`${config.siteUrl}/api/v1/memories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: memory.title,
        content: memory.content,
        type: memory.type,
        source: "e2e-ab",
        tags: [...memory.tags, fixtureTag(fixture.id)],
        confidence: memory.confidence,
        externalId: `e2e-ab:${fixture.id}:${index}`,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(
        `Seed failed for ${fixture.id} "${memory.title}": HTTP ${response.status} ${detail}`,
      );
    }
  }
  return ordered.length;
}

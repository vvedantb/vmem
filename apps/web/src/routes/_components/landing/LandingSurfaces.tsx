import {
  LandingLattice,
  LandingReveal,
  LandingRevealItem,
  LandingSection,
  LandingSectionHeading,
} from "./LandingReveal";

const surfaces = [
  {
    id: "mcp",
    label: "MCP",
    title: "Call it from an agent",
    description:
      "memory.retrieve and memory.save over Clerk OAuth. Team scope lives at /mcp/team.",
    code: `mcp memory.retrieve
  "What editor does the user prefer?"

→ 2 matches
  profile  0.94  vim, concise replies
  skill    0.41  via memory.retrieve`,
  },
  {
    id: "http",
    label: "HTTP",
    title: "Same graph over REST",
    description:
      "Bearer vmem_sk_… against /api/v1/memories. Create, search, and patch without the dashboard.",
    code: `POST /api/v1/memories/search
Authorization: Bearer vmem_sk_…
{ "query": "preferred language" }`,
  },
  {
    id: "sdk",
    label: "SDK",
    title: "A few lines in Node",
    description:
      "@vmem/sdk saves, updates, and searches. Conflicting updates become proposals instead of silent overwrites.",
    code: `import { VMemory } from "@vmem/sdk";

const vmem = new VMemory();
await vmem.save("User prefers TypeScript");
const { memories } = await vmem.search(
  "preferred language",
);`,
  },
] as const;

export function LandingSurfaces() {
  return (
    <LandingSection id="surfaces">
      <LandingReveal>
        <LandingRevealItem>
          <LandingSectionHeading
            eyebrow="Surfaces"
            heading="MCP, HTTP, and an SDK on the same graph"
            intro="The dashboard is how you inspect it. Agents talk to it through the same store."
          />
        </LandingRevealItem>

        <LandingRevealItem className="mt-10">
          <LandingLattice className="lg:grid-cols-3">
            {surfaces.map((surface) => (
              <article
                key={surface.id}
                className="flex h-full flex-col bg-background"
              >
                <div className="flex flex-1 flex-col px-5 pb-4 pt-5 sm:px-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                    {surface.label}
                  </p>
                  <h3 className="mt-2 text-base font-medium text-foreground">
                    {surface.title}
                  </h3>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted">
                    {surface.description}
                  </p>
                </div>
                <pre className="overflow-x-auto border-t border-separator bg-surface px-5 py-4 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin sm:px-6">
                  {surface.code}
                </pre>
              </article>
            ))}
          </LandingLattice>
        </LandingRevealItem>
      </LandingReveal>
    </LandingSection>
  );
}

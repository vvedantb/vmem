import { SignUpButton } from "@clerk/clerk-react";
import { Button } from "@vmem/ui";
import {
  LandingReveal,
  LandingRevealItem,
  LandingSectionEyebrow,
  landingShellClass,
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
    <section
      id="surfaces"
      className={`${landingShellClass} scroll-mt-24 py-16 sm:py-24`}
    >
      <LandingReveal>
        <LandingRevealItem>
          <LandingSectionEyebrow>Surfaces</LandingSectionEyebrow>
        </LandingRevealItem>
        <LandingRevealItem>
          <h2 className="max-w-lg text-balance font-instrumentSerif text-3xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            MCP, HTTP, and an SDK on the same graph
          </h2>
        </LandingRevealItem>
        <LandingRevealItem>
          <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted sm:text-base">
            The dashboard is how you inspect it. Agents talk to it through the
            same store.
          </p>
        </LandingRevealItem>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {surfaces.map((surface) => (
            <LandingRevealItem key={surface.id}>
              <article className="flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-surface p-2 shadow-soft outline outline-1 -outline-offset-1 outline-black/10 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 dark:outline-white/10">
                <div className="flex flex-1 flex-col rounded-2xl px-4 pb-4 pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    {surface.label}
                  </p>
                  <h3 className="mt-2 text-base font-medium text-foreground">
                    {surface.title}
                  </h3>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted">
                    {surface.description}
                  </p>
                </div>
                <pre className="overflow-x-auto rounded-2xl bg-surface-secondary px-4 py-3 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin">
                  {surface.code}
                </pre>
              </article>
            </LandingRevealItem>
          ))}
        </div>

        <LandingRevealItem>
          <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-[1.5rem] bg-surface px-6 py-8 sm:flex-row sm:items-center sm:px-8">
            <div>
              <p className="font-instrumentSerif text-3xl leading-tight text-foreground text-balance">
                Put memory under the agents you already use
              </p>
              <p className="mt-2 max-w-md text-pretty text-sm text-muted">
                Create an account, open a profile, add a memory. Check it shows
                up on the graph.
              </p>
            </div>
            <SignUpButton mode="modal">
              <Button size="lg">Get started</Button>
            </SignUpButton>
          </div>
        </LandingRevealItem>
      </LandingReveal>
    </section>
  );
}

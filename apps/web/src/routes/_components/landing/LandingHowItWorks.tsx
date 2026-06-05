const steps = [
  {
    index: "01",
    title: "Store",
    description:
      "Capture context from chat, tools, and HTTP — tagged by profile.",
  },
  {
    index: "02",
    title: "Connect",
    description:
      "Memories link in a graph so relationships survive between sessions.",
  },
  {
    index: "03",
    title: "Recall",
    description: "Agents pull the right slice via MCP, skills, or the API.",
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section className="mt-16 sm:mt-20">
      <p className="mb-8 text-xs font-medium uppercase tracking-[0.22em] text-muted">
        How it works
      </p>
      <div className="grid gap-8 sm:grid-cols-3 sm:gap-6 lg:gap-10">
        {steps.map((step) => (
          <div key={step.title} className="max-w-xs">
            <p className="font-instrumentSerif text-3xl tabular-nums text-muted/50">
              {step.index}
            </p>
            <p className="mt-2 text-base font-medium text-foreground">
              {step.title}
            </p>
            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

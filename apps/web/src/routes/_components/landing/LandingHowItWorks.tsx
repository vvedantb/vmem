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
    <section className="mt-12 sm:mt-16 md:mt-20">
      <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted sm:mb-8 sm:tracking-[0.22em]">
        How it works
      </p>
      <div className="grid gap-7 sm:gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
        {steps.map((step) => (
          <div key={step.title} className="min-w-0 md:max-w-xs">
            <p className="font-instrumentSerif text-2xl tabular-nums text-muted/50 sm:text-3xl">
              {step.index}
            </p>
            <p className="mt-1.5 text-base font-medium text-foreground sm:mt-2">
              {step.title}
            </p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted sm:mt-1.5">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

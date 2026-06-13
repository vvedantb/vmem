import type { ComponentType } from "react";
import { Slide01Title } from "./01-title";
import { Slide02Problem } from "./02-problem";
import { Slide03What } from "./03-what";
import { Slide04How } from "./04-how";
import { Slide05Graph } from "./05-graph";
import { Slide06Trace } from "./06-trace";
import { Slide07Capture } from "./07-capture";
import { Slide08Dream } from "./08-dream";
import { Slide09Safe } from "./09-safe";
import { Slide10Workspaces } from "./10-workspaces";
import { Slide11Comparison } from "./11-comparison";
import { Slide12Closing } from "./12-closing";
import { Slide13Bento } from "./13-bento";
import { Slide14Questions } from "./14-questions";
import { Slide15Showcase } from "./15-showcase";
import { Slide16Tomorrow } from "./16-tomorrow";
import { Slide17Pipeline } from "./17-pipeline";
import { Slide18Local } from "./18-local";
import { Slide19UseCases } from "./19-usecases";
import { Slide20CompanyBrain } from "./20-companybrain";
import { Slide21Eva } from "./21-eva";
import { Slide22FormFactors } from "./22-formfactors";
import { Slide23Trust } from "./23-trust";
import { Slide24Benchmarks } from "./24-benchmarks";
import { Slide25Moat } from "./25-moat";
import { Slide26Stickiness } from "./26-stickiness";
import { Slide27Landscape } from "./27-landscape";
import { Slide28Gaps } from "./28-gaps";
import { Slide29VmemSolves } from "./29-vmemsolves";
import { Slide30Weaknesses } from "./30-weaknesses";
import { Slide31Defensibility } from "./31-defensibility";
import { Slide32Demo } from "./32-demo";

export interface SlideEntry {
  id: string;
  title: string;
  theme: "dark" | "light";
  Component: ComponentType;
  /**
   * Number of click-through build steps beyond the initial (step 0) state.
   * A slide where all content appears on entry has steps: 0.
   * Each forward click reveals the next step; each backward click hides it.
   */
  steps: number;
}

export const SLIDES: SlideEntry[] = [
  // step 0: brand + title  /  step 1: subtitle + footer
  {
    id: "01",
    title: "Title",
    theme: "dark",
    Component: Slide01Title,
    steps: 1,
  },
  // step 0: kicker + title  /  step 1: pain cards  /  step 2: body
  {
    id: "02",
    title: "The problem",
    theme: "light",
    Component: Slide02Problem,
    steps: 2,
  },
  // step 0: kicker + title  /  step 1: body  /  step 2: surfaces  /  step 3: callout box
  {
    id: "03",
    title: "What vmem is",
    theme: "light",
    Component: Slide03What,
    steps: 3,
  },
  // step 0: kicker + title + body  /  steps 1-4: one pipeline stage each
  {
    id: "04",
    title: "How it works",
    theme: "light",
    Component: Slide04How,
    steps: 4,
  },
  // step 0: kicker + title  /  step 1: before chain  /  step 2: after chain
  {
    id: "17",
    title: "One call",
    theme: "light",
    Component: Slide17Pipeline,
    steps: 2,
  },
  // step 0: kicker + title + graph panel  /  step 1: body  /  step 2: concept rows
  {
    id: "05",
    title: "Memory graph",
    theme: "light",
    Component: Slide05Graph,
    steps: 2,
  },
  // step 0: kicker + title + body  /  step 1: trace table  /  step 2: bottom body
  {
    id: "06",
    title: "Context Trace",
    theme: "light",
    Component: Slide06Trace,
    steps: 2,
  },
  // step 0: kicker + title  /  step 1: source cards  /  step 2: bottom body
  {
    id: "07",
    title: "Capture everywhere",
    theme: "light",
    Component: Slide07Capture,
    steps: 2,
  },
  // step 0: kicker + title + body  /  step 1: output rows  /  step 2: info bar
  {
    id: "08",
    title: "Dream Mode",
    theme: "light",
    Component: Slide08Dream,
    steps: 2,
  },
  // step 0: kicker + title + body  /  step 1: safety cards
  {
    id: "09",
    title: "Safe by design",
    theme: "light",
    Component: Slide09Safe,
    steps: 1,
  },
  // step 0: kicker + title + body  /  step 1: personal + team cards  /  step 2: shared content
  {
    id: "10",
    title: "Workspaces & teams",
    theme: "light",
    Component: Slide10Workspaces,
    steps: 2,
  },
  // step 0: title  /  step 1: RAG/GraphRAG/context cards  /  step 2: context insight
  {
    id: "27",
    title: "How others solve it",
    theme: "light",
    Component: Slide27Landscape,
    steps: 2,
  },
  // step 0: title  /  step 1: three gap cards  /  step 2: flat-pile takeaway
  {
    id: "28",
    title: "Where they fall short",
    theme: "light",
    Component: Slide28Gaps,
    steps: 2,
  },
  // step 0: title  /  step 1: dream/relationship/sync cards  /  step 2: takeaway
  {
    id: "29",
    title: "How vmem solves it",
    theme: "light",
    Component: Slide29VmemSolves,
    steps: 2,
  },
  // step 0: kicker + title  /  step 1: comparison table
  {
    id: "11",
    title: "vs the field",
    theme: "light",
    Component: Slide11Comparison,
    steps: 1,
  },
  // step 0: title  /  step 1: in-progress benchmark rows  /  step 2: personal-use quote
  {
    id: "24",
    title: "Benchmarks",
    theme: "light",
    Component: Slide24Benchmarks,
    steps: 2,
  },
  // step 0: title  /  step 1: four domain use-case cards
  {
    id: "19",
    title: "Use cases",
    theme: "light",
    Component: Slide19UseCases,
    steps: 1,
  },
  // step 0: title + body  /  step 1: three pillars
  {
    id: "20",
    title: "Company brain",
    theme: "dark",
    Component: Slide20CompanyBrain,
    steps: 1,
  },
  // step 0: title + body  /  step 1: working-memory grid  /  step 2: flywheel callout
  {
    id: "21",
    title: "Eva",
    theme: "light",
    Component: Slide21Eva,
    steps: 2,
  },
  // step 0: title  /  step 1: three trust pillars
  {
    id: "23",
    title: "Trust",
    theme: "light",
    Component: Slide23Trust,
    steps: 1,
  },
  // step 0: kicker + title  /  step 1: body + CTA  /  step 2: roadmap cards
  {
    id: "12",
    title: "Closing",
    theme: "light",
    Component: Slide12Closing,
    steps: 2,
  },
  // step 0: title  /  step 1: three thesis cards  /  step 2: ownership punchline
  {
    id: "25",
    title: "Memory is the moat",
    theme: "dark",
    Component: Slide25Moat,
    steps: 2,
  },
  // step 0: title  /  step 1: lock-in spiral  /  step 2: portability resolution
  {
    id: "26",
    title: "Cost of stickiness",
    theme: "dark",
    Component: Slide26Stickiness,
    steps: 2,
  },
  // step 0: title  /  step 1: three honest weakness cards
  {
    id: "30",
    title: "Weaknesses",
    theme: "dark",
    Component: Slide30Weaknesses,
    steps: 1,
  },
  // step 0: title  /  step 1: three defensibility cards  /  step 2: takeaway
  {
    id: "31",
    title: "Defensibility",
    theme: "dark",
    Component: Slide31Defensibility,
    steps: 2,
  },
  // step 0: 3D screenshot showcase (panels fly in, idle float)
  {
    id: "15",
    title: "Showcase",
    theme: "dark",
    Component: Slide15Showcase,
    steps: 0,
  },
  // step 0: laptop-mockup Ken-Burns zoom over the graph screenshot
  {
    id: "32",
    title: "Live demo",
    theme: "dark",
    Component: Slide32Demo,
    steps: 0,
  },
  // step 0: full bento board (tiles cascade in)
  {
    id: "13",
    title: "Everything vmem",
    theme: "dark",
    Component: Slide13Bento,
    steps: 0,
  },
  // step 0: title  /  step 1: two trend cards  /  step 2: opus-local stat  /  step 3: closing line
  {
    id: "18",
    title: "Local models",
    theme: "dark",
    Component: Slide18Local,
    steps: 3,
  },
  // step 0: title  /  step 1: three form-factor cards  /  step 2: connect-vmem punchline
  {
    id: "22",
    title: "Form factors",
    theme: "dark",
    Component: Slide22FormFactors,
    steps: 2,
  },
  // step 0: four lines blur in sequentially (past dim, future bright)
  {
    id: "16",
    title: "Tomorrow",
    theme: "dark",
    Component: Slide16Tomorrow,
    steps: 0,
  },
  // step 0: everything
  {
    id: "14",
    title: "Questions",
    theme: "dark",
    Component: Slide14Questions,
    steps: 0,
  },
];

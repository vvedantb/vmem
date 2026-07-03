import type { ComponentType } from "react";
import { Slide00Black } from "./00-black";
import { Slide01Title } from "./01-title";
// Poll slides temporarily removed from the running order (deck is long); the
// files and entries below are kept, just commented out, so they're easy to
// re-add later.
// import { SlidePollModels } from "./poll-models";
// import { SlidePollSwitch } from "./poll-switch";
// import { SlidePollStickiness } from "./poll-stickiness";
// import { SlidePollPrivacy } from "./poll-privacy";
// import { SlidePollFragmentation } from "./poll-fragmentation";
import { SlideFragmentScatter } from "./frag-scatter";
import { SlideFragmentCollapse } from "./frag-collapse";
import { Slide03What } from "./03-what";
import { Slide04How } from "./04-how";
import { Slide05Graph } from "./05-graph";
import { Slide06Trace } from "./06-trace";
import { Slide07Capture } from "./07-capture";
import { Slide08Dream } from "./08-dream";
import { Slide09Safe } from "./09-safe";
import { Slide10Workspaces } from "./10-workspaces";
// import { Slide11Comparison } from "./11-comparison"; // hidden from the running order
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
// import { Slide32Demo } from "./32-demo"; // temporarily removed from the running order
import { Slide33Questions } from "./33-questions";
import { Slide34Surfaces } from "./34-surfaces";
import { Slide35Sovereignty } from "./35-sovereignty";
import { Slide36GraphBuild } from "./36-graphbuild";
import { Slide37NodeDetail } from "./37-nodedetail";
import { Slide39ClaudeChat } from "./39-claudechat";
import { Slide40Privacy } from "./40-privacy";
import { Slide41MultiModel } from "./41-multimodel";
import { Slide42SharedBrain } from "./42-sharedbrain";

export interface SlideEntry {
  id: string;
  title: string;
  theme: "dark" | "light";
  Component: ComponentType;
  /**
   * Number of build steps beyond the initial (step 0) state. A slide where all
   * content appears on entry has steps: 0. Steps auto-reveal on a stagger once
   * the slide loads (see SlideDeck) — no clicking.
   */
  steps: number;
  /**
   * Optional per-slide override (ms) for the gap between auto-revealed build
   * steps. Defaults to DEFAULT_STAGGER_MS in SlideDeck. Use a smaller value on
   * slides with many quick steps so they do not drag.
   */
  staggerMs?: number;
}

/**
 * Running order, grouped into acts. Theme is set HERE (not in the slide files),
 * so the deck keeps a clean dark-open → light-body → dark-finale arc with only
 * two theme transitions. Slides not in this list (02 The problem, poll-connectors)
 * still exist as files and can be re-added.
 */
export const SLIDES: SlideEntry[] = [
  // ── Act 1 · Open (dark) ──────────────────────────────────────────────
  {
    id: "00",
    title: "Start",
    theme: "dark",
    Component: Slide00Black,
    steps: 0,
  },
  {
    id: "01",
    title: "Title",
    theme: "dark",
    Component: Slide01Title,
    steps: 2,
  },

  // ── Act 2 · Hook polls (light) — temporarily removed ─────────────────
  /*
  {
    id: "poll-models",
    title: "Poll — AI models",
    theme: "light",
    Component: SlidePollModels,
    steps: 0,
  },
  {
    id: "poll-switch",
    title: "Poll — switch scenario",
    theme: "light",
    Component: SlidePollSwitch,
    steps: 0,
  },
  {
    id: "poll-fragmentation",
    title: "Poll — fragmentation",
    theme: "light",
    Component: SlidePollFragmentation,
    steps: 0,
  },
  */

  // ── Act 3 · The problem, made visual (light) ─────────────────────────
  // poll → scatter → collapse into one vmem layer (replaces old "02 The problem")
  {
    id: "frag-scatter",
    title: "Fragmentation",
    theme: "light",
    Component: SlideFragmentScatter,
    steps: 2,
  },
  {
    id: "frag-collapse",
    title: "Everything in, any model out",
    theme: "light",
    Component: SlideFragmentCollapse,
    steps: 0,
  },
  {
    id: "33",
    title: "Everyone's asking",
    theme: "light",
    Component: Slide33Questions,
    steps: 1,
  },

  // ── Act 4 · What vmem is + how it works (light) ──────────────────────
  {
    id: "03",
    title: "What vmem is",
    theme: "light",
    Component: Slide03What,
    steps: 3,
    staggerMs: 1200,
  },
  {
    id: "04",
    title: "How it works",
    theme: "light",
    Component: Slide04How,
    steps: 4,
    staggerMs: 1200,
  },
  {
    id: "17",
    title: "One call",
    theme: "light",
    Component: Slide17Pipeline,
    steps: 1,
    staggerMs: 7000,
  },
  {
    id: "05",
    title: "Memory graph",
    theme: "light",
    Component: Slide05Graph,
    steps: 2,
  },
  {
    id: "06",
    title: "Context Trace",
    theme: "light",
    Component: Slide06Trace,
    steps: 2,
    staggerMs: 1200,
  },
  {
    id: "07",
    title: "Capture everywhere",
    theme: "light",
    Component: Slide07Capture,
    steps: 2,
    staggerMs: 1200,
  },
  {
    id: "08",
    title: "Dream Mode",
    theme: "light",
    Component: Slide08Dream,
    steps: 2,
    staggerMs: 1200,
  },
  {
    id: "09",
    title: "Safe by design",
    theme: "light",
    Component: Slide09Safe,
    steps: 1,
  },
  {
    id: "10",
    title: "Workspaces & teams",
    theme: "light",
    Component: Slide10Workspaces,
    steps: 2,
  },

  // ── Act 5 · Proof — vs the field + credibility (light) ────────────────
  {
    id: "27",
    title: "How others solve it",
    theme: "light",
    Component: Slide27Landscape,
    steps: 2,
  },
  {
    id: "28",
    title: "Where they fall short",
    theme: "light",
    Component: Slide28Gaps,
    steps: 2,
  },
  {
    id: "29",
    title: "How vmem solves it",
    theme: "light",
    Component: Slide29VmemSolves,
    steps: 2,
  },
  // Comparison table hidden for the team talk — low value for an internal
  // audience (more of a sales/investor artifact); the "vs others" story is
  // still carried by 27/28/29. Kept here, commented, to re-add easily.
  /*
  {
    id: "11",
    title: "vs the field",
    theme: "light",
    Component: Slide11Comparison,
    steps: 1,
  },
  */
  {
    id: "24",
    title: "Benchmarks",
    theme: "light",
    Component: Slide24Benchmarks,
    steps: 2,
  },
  {
    id: "19",
    title: "Use cases",
    theme: "light",
    Component: Slide19UseCases,
    steps: 1,
  },
  {
    id: "21",
    title: "Eva",
    theme: "light",
    Component: Slide21Eva,
    steps: 2,
    staggerMs: 2800,
  },
  {
    id: "23",
    title: "Trust",
    theme: "light",
    Component: Slide23Trust,
    steps: 1,
  },

  // ── Act 6 · The vision + see it live (dark) ──────────────────────────
  {
    id: "20",
    title: "Company brain",
    theme: "dark",
    Component: Slide20CompanyBrain,
    steps: 1,
  },
  {
    id: "42",
    title: "Shared brain",
    theme: "dark",
    Component: Slide42SharedBrain,
    steps: 3,
    staggerMs: 1600,
  },
  {
    id: "15",
    title: "Showcase",
    theme: "dark",
    Component: Slide15Showcase,
    steps: 0,
  },
  // Live demo temporarily removed from the running order
  /*
  {
    id: "32",
    title: "Live demo",
    theme: "dark",
    Component: Slide32Demo,
    steps: 0,
  },
  */
  {
    id: "36",
    title: "Graph build-up",
    theme: "dark",
    Component: Slide36GraphBuild,
    steps: 5,
    staggerMs: 1400,
  },
  {
    id: "37",
    title: "Node detail",
    theme: "dark",
    Component: Slide37NodeDetail,
    steps: 0,
  },
  {
    id: "39",
    title: "Same answer, any model",
    theme: "dark",
    Component: Slide39ClaudeChat,
    steps: 0,
  },
  {
    id: "34",
    title: "More of the app",
    theme: "dark",
    Component: Slide34Surfaces,
    steps: 0,
  },

  // ── Act 7 · Why it's defensible — the moat (dark) ─────────────────────
  // poll-stickiness temporarily removed from the running order
  /*
  {
    id: "poll-stickiness",
    title: "Poll — stickiness",
    theme: "dark",
    Component: SlidePollStickiness,
    steps: 0,
  },
  */
  {
    id: "25",
    title: "Memory is the moat",
    theme: "dark",
    Component: Slide25Moat,
    steps: 2,
  },
  {
    id: "26",
    title: "Cost of stickiness",
    theme: "dark",
    Component: Slide26Stickiness,
    steps: 2,
  },
  {
    id: "41",
    title: "The token bill",
    theme: "dark",
    Component: Slide41MultiModel,
    steps: 2,
  },
  {
    id: "35",
    title: "The real test",
    theme: "dark",
    Component: Slide35Sovereignty,
    steps: 2,
  },

  // ── Act 8 · Privacy & sovereignty (dark) ─────────────────────────────
  // poll-privacy temporarily removed from the running order
  /*
  {
    id: "poll-privacy",
    title: "Poll — personal data",
    theme: "dark",
    Component: SlidePollPrivacy,
    steps: 0,
  },
  */
  {
    id: "18",
    title: "Local models",
    theme: "dark",
    Component: Slide18Local,
    steps: 3,
  },
  {
    id: "40",
    title: "Private by design",
    theme: "dark",
    Component: Slide40Privacy,
    steps: 2,
  },

  // ── Act 9 · Honest + close (dark) ────────────────────────────────────
  {
    id: "30",
    title: "Weaknesses",
    theme: "dark",
    Component: Slide30Weaknesses,
    steps: 1,
  },
  {
    id: "31",
    title: "Defensibility",
    theme: "dark",
    Component: Slide31Defensibility,
    steps: 2,
  },
  {
    id: "22",
    title: "Form factors",
    theme: "dark",
    Component: Slide22FormFactors,
    steps: 2,
  },
  {
    id: "13",
    title: "Everything vmem",
    theme: "dark",
    Component: Slide13Bento,
    steps: 0,
  },
  {
    id: "16",
    title: "Tomorrow",
    theme: "dark",
    Component: Slide16Tomorrow,
    steps: 0,
  },
  // Closing flipped to dark so the finale stays one continuous dark block —
  // VERIFY visually: this slide uses SlideAmbientGraph + roadmap cards.
  {
    id: "12",
    title: "Closing",
    theme: "dark",
    Component: Slide12Closing,
    steps: 2,
  },
  {
    id: "14",
    title: "Questions",
    theme: "dark",
    Component: Slide14Questions,
    steps: 0,
  },
];

import { SLIDES } from "./slides/index";

/**
 * Presenter script — one entry per slide `id` in `slides/index.ts`.
 * Only read on your machine when you are driving the deck; never sent over
 * the share session.
 */
export const SPEAKER_NOTES: Record<string, string> = {
  "00": "Black opener — click forward when you're ready.",
  "01": "Introduce yourself and the topic. Let the title animation finish.",

  "poll-models":
    "Share the deck link first if you haven't.\nPause ~30s. Call out the spread — work vs personal.",
  "poll-switch":
    "Read the scenario slowly. This is the emotional hook — most people won't switch instantly.",
  "poll-fragmentation":
    "Let them vote. You'll pay this off on the next two slides.",
  "poll-stickiness":
    "Multi-select — 'tap everything that would actually stop you'.",
  "poll-privacy": "Sets up local models / private-by-design later in the deck.",

  "frag-scatter": "Name the tools on screen. Memory is scattered everywhere.",
  "frag-collapse": "This is the thesis in one picture — one layer underneath.",
  "33": "These are real questions people ask. You don't need to read every card.",

  "03": "Plain language: vmem remembers for you, across tools.",
  "04": "Walk the pipeline left to right — save, enrich, retrieve.",
  "17": "One API call vs wiring five systems yourself.",
  "05": "The graph is how it stays organised — not a flat pile.",
  "06": "Trace = show your work. Where did this answer come from?",
  "07": "Browser, phone, MCP — capture everywhere.",
  "08": "Dream mode runs while you're away — consolidates overnight.",
  "09": "Pinned, suppressed, team boundaries — safety rails.",
  "10": "Personal vs team workspaces.",

  "27": "Landscape — how others attack the problem.",
  "28": "Where they fall short.",
  "29": "How vmem is different.",
  "11": "Comparison table — don't read every row.",
  "24": "Benchmarks are in progress — honest about status.",
  "19": "Use cases — pick two that match the room.",
  "21": "Eva tie-in if relevant to your story.",
  "23": "Trust pillars.",

  "20": "Company brain vision.",
  "15": "Let the showcase breathe — minimal narration.",
  "32": "Live demo — have a backup if Wi‑Fi dies.",
  "36": "Graph builds up — let the animation run.",
  "37": "Node detail tabs cycle on their own.",
  "39": "Same memory, Claude or ChatGPT — the portability punchline.",
  "34": "More surfaces — skills, wiki, connectors.",

  "25": "Memory is the moat.",
  "26": "Stickiness has a cost — vendor lock-in.",
  "35": "Sovereignty — what happens if Claude shuts down?",

  "18": "Local models + privacy angle.",
  "40": "Private by design.",

  "30": "Weaknesses — be honest, builds credibility.",
  "31": "Why it's still defensible.",
  "22": "Form factors — web, extension, mobile, MCP.",
  "13": "Bento overview — optional if short on time.",
  "16": "Tomorrow — where this goes.",
  "12": "Closing — CTA and thanks.",
  "14": "Questions — stop talking.",
};

export function getSpeakerNotes(slideNumber: number): {
  slideId: string;
  slideTitle: string;
  notes: string;
} {
  const entry = SLIDES[slideNumber - 1];
  if (!entry) {
    return { slideId: "", slideTitle: "", notes: "" };
  }
  const scripted = SPEAKER_NOTES[entry.id];
  return {
    slideId: entry.id,
    slideTitle: entry.title,
    notes: scripted ?? "",
  };
}

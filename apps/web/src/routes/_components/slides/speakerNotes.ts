import { SLIDES } from "./slides/index";

/**
 * Presenter script — one entry per slide `id` in `slides/index.ts`.
 * Only read on your machine when you are driving the deck; never sent over
 * the share session.
 */
export const SPEAKER_NOTES: Record<string, string> = {
  "00": "Quick one to kick off — how many times this week have you re-explained the same thing to an AI? Right. That's what I've been building something to fix.",
  "01": "This is vmem — my master's project. The short version: it remembers everything you tell your AI, so you never start from zero again.",

  "poll-models":
    "Excluding Claude — which other AI models do you actually use day to day? Be honest.",
  "poll-switch":
    "Here's a scenario. You've used Claude every day for five years. ChatGPT 10 launches, clearly better. Do you switch — or has too much of you built up in here?",
  "poll-fragmentation":
    "Rough count — how many different AI tools have learned something about how you work? One? A handful? Lost count?",
  "poll-stickiness":
    "If a cheaper, better model came along tomorrow — what would actually stop you leaving? Tap everything that applies.",
  "poll-privacy":
    "Outside of work — how comfortable are you really putting sensitive personal data into these models?",

  "frag-scatter":
    "Here's the problem. Every tool you use knows a slice of you — your drafts, your code, your emails, your tabs. But none of them know you. And the moment you switch, that slice is gone.",
  "frag-collapse":
    "vmem sits underneath all of them. It holds the memory once, every tool reads from the same place — and it's yours, not theirs.",
  "33": "These are the questions people keep asking. Why are my chats separate? Why is memory so limited? How do I move it between tools? vmem is our answer to all of them.",

  "03": "So what is vmem? You capture something once — a page, a file, a voice note, something you said in chat. vmem stores it, labels it, and links the people and things involved. Ask from any other app, and the whole picture comes back.",
  "04": "Four steps. Capture — anything, from anywhere. Enrich — it labels the topics and pulls out the names. Connect — related memories link up on their own. Recall — you ask, and you get the full picture back, with its sources.",
  "17": "Without vmem, your AI rebuilds everything from scratch on every prompt — search Linear, open SharePoint, query Eva, reason again. With vmem, that's one call: everything already connected, already reasoned over.",
  "05": "Under the hood it isn't a flat list — it's connected. Every memory links to the topics, the names, and the other memories it touches. One thing leads to the next.",
  "06": "And every time it brings something back, it tells you why — same topic, same person, same conversation — with a score. No black box.",
  "07": "You can capture from everywhere. The browser extension grabs pages and history, the phone turns your voice into memory, Claude saves and reads automatically, and any file you upload becomes searchable.",
  "08": "While you're away, vmem revisits your memories and tidies them up — spotting contradictions, merging duplicates, and building a picture of how you work. It gets smarter overnight.",
  "09": "You stay in control. Nothing silently overwrites — you approve changes. Pin what matters, hide what's wrong, expire what's temporary, and there's a full history of every change.",
  "10": "Memory is personal by default. Teams can share skills, a wiki, and files — but your personal memories stay private to you.",

  "27": "How does everyone else solve this? Search and paste a few similar notes, map the connections first, or carefully hand the AI exactly the right context. It all comes down to context — get it right and answers are more accurate and cheaper.",
  "28": "But they fall short. Memories sit alone, with no links between them, no tie back to your real data, and nothing ever revisits them. You end up with a flat pile of notes.",
  "29": "vmem is different. It revisits memories overnight, brings them back by how they connect — not just what looks similar — and stays in sync as your data changes.",
  "11": "Side by side with the others — connected memory, it shows you why things matched, it asks before it overwrites, you get full control of each memory, and it improves itself. We do things they don't.",
  "24": "Formal benchmarks are still in progress — I'll be honest about that. The real proof: I've run vmem on my own Claude and ChatGPT for weeks, and having everything accessible everywhere has been genuinely brilliant.",
  "19": "This matters in every team. Support remembers the whole customer history. Healthcare carries context between visits. Finance grounds advice in the client's goals. Sales picks up exactly where the last rep left off.",
  "21": "We use it ourselves. Eva — our own internal assistant — runs on vmem, so she remembers every action, every task, every decision. And she keeps getting better as the data grows.",
  "23": "Why you can trust it: you own your data — view, edit, or delete it anytime. It's private by default. And it runs on your own devices, no cloud required.",

  "20": "Zoom out and this becomes the company brain. One living memory for the whole organisation — every decision, every reason, every source — that any person or any AI can think inside.",
  "15": "This is the product today — the memory graph, the dashboard, your memories.",
  "32": "Let me show you live. Every dot is a memory — click one and you see what connects to it.",
  "36": "Watch one memory become a web. A trip to Japan links to the ryokan, the ramen, the travel card — and it keeps branching out.",
  "37": "Click any memory and you get the full story — the details, its history of changes, and everything it connects to.",
  "39": "Same question, two assistants. Claude and ChatGPT both pull from the same vmem memory and give you the same answer. The memory is yours — the model is just the voice.",
  "34": "There's more to the app too — skills, a wiki, and connectors.",

  "25": "Here's the thesis: memory is the moat. Models all catch up to each other. Software gets copied. What's left — what's actually yours — is the memory built up about you.",
  "26": "But there's a cost to stickiness. The more you personalise around one tool, the more locked in you get. Anything you set up should be easy to move — and vmem itself is open source, so you can run it anywhere.",
  "41": "And it's not just me saying this. The big companies — the ones paying by the token, at scale — are all pulling back. Meta hit seventy-three trillion tokens a month, then scrapped its usage leaderboard — their CTO said all motion is not progress. Uber burnt its whole year's AI budget in four months. Coinbase halved its spend by routing the routine work to cheaper models. And Perplexity runs about twenty models, always picking the cheapest one that does the job. And notice — this isn't people using less AI. Usage is still climbing, token counts are still going up. They're just routing the routine work to cheaper models and saving the expensive ones for when it actually matters. The pattern's the same everywhere — nobody's betting on one model any more. Cheap where it can be, frontier where it has to be. And that only works if your memory travels with you, instead of being trapped in whichever model you happened to pick.\n\nSources: Meta — michaelparekh.substack.com/p/ai-meta-steps-back-from-ai-tokenmaxxing (15 Jun 2026); Uber — fortune.com/2026/05/26/uber-coo-ai-spending-tokens-claude-code (26 May 2026); Coinbase — finance.yahoo.com/markets/crypto/articles/coinbase-ceo-halved-ai-costs-130000536.html (27 Jun 2026); Perplexity — x.com/AravSrinivas/status/2070929445251400092.",

  "35": "The real test: do you control the model, or does it control you? If Claude shut down tomorrow, you'd swap in another model and keep all your expertise. As Satya Nadella puts it — swap out the generalist without losing the company veteran.",

  "18": "And models are going local. Open ones close the gap every few months, small ones already run on your phone, and an Opus-level model runs on a machine today. Soon every laptop ships with one.",
  "40": "Which means some data never has to leave. For anything sensitive, vmem runs entirely on your own machine — private by design.",

  "30": "Let me be honest about the weak spots. Answers can be a little slower, because it follows all those connections. Simpler tools are faster at raw lookup. And the big labs are improving their own memory fast.",
  "31": "But here's what holds. They might get faster — but they can't give you ownership, portability, and independence. That stays with vmem.",
  "22": "And whatever comes next — glasses, a watch, robots, a digital twin — you won't set it up from scratch. Connect vmem and your whole self is already there.",
  "13": "That's everything vmem is, on one board — the connectors, the surfaces, the whole toolkit.",
  "16": "One last thought. Last year it was Perplexity. Yesterday, ChatGPT. Today, Claude. Tomorrow — who knows. The model keeps changing. Your memory shouldn't.",
  "12": "vmem is live today, and it's only just getting started. Try it at vmem.app. Thank you.",
  "14": "Right — that's me. What questions do you have?",
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

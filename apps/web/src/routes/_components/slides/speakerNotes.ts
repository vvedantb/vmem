import { SLIDES } from "./slides/index";

/**
 * Presenter script — one entry per slide `id` in `slides/index.ts`.
 * Written in Vedant's spoken voice (see `.claude/skills/vedant-voice`):
 * teaches from zero, one sentence per line so it's easy to read and speak from.
 * Rendered with `whitespace-pre-wrap`, so the line breaks show in presenter view.
 * Only read on your machine when you are driving the deck; never sent over
 * the share session.
 */
export const SPEAKER_NOTES: Record<string, string> = {
  "00": `So, quick one to start.
Think about how many times just this week you've had to re-explain yourself to an AI.
Who you are, what you're working on, how you like things done — every new chat, you're typing it all out again from scratch.
And it's not just the AI — that context is scattered across every app you use, and none of them talk to each other.
So that's the problem I've spent a while building something to fix.
And that something is what I want to show you today.`,
  "01": `So this is it — vmem.
It's my uni project, and the one-line version is this: it's a memory and context layer or engine for your AI that actually remembers you.
Everything you tell it, every document, every decision — it holds onto all of it.
So you're never starting from zero again.
Let me show you what that actually means.`,

  // Poll slides temporarily removed from the running order — notes kept here,
  // commented out, so they return alongside the slides if re-added.
  /*
  "poll-models":
    "So excluding Claude — which other models do you actually use day to day? Be honest.",
  "poll-switch":
    "Ok, here's a scenario. You've used Claude every day for five years, then ChatGPT 10 drops, clearly better. Do you switch — or has too much of you built up in here already?",
  "poll-fragmentation":
    "So roughly — how many different AI tools have learned something about how you work? One? A handful? Lost count?",
  "poll-stickiness":
    "So if a cheaper, better model came along tomorrow — what would actually stop you leaving? Tap everything that applies.",
  "poll-privacy":
    "So outside of work — how comfortable are you really putting sensitive personal stuff into these models?",
  */

  "frag-scatter": `So here's the problem, laid out.
Every AI you use has quietly picked up a slice of you — ChatGPT's learned the tone of your writing, Claude knows your code, and so on.
But none of them share any of it, so each one only ever knows its own little piece.
And that's before your actual work even comes into it — that's spread across SharePoint, Linear, Teams, your inbox, all separate systems that don't talk to each other.
Right now, the only thing tying all of that together is you, holding the connections in your head.
A person can do that — but an AI can't, so it ends up digging through every one of those systems and piecing the picture back together from scratch, every single time you ask it something.`,
  "frag-collapse": `So this is the fix, and it's a simple idea.
Instead of your memory being trapped inside each separate app, vmem sits underneath all of them as one shared layer.
Everything gets captured into that one place — and it's yours, it belongs to you, not to any of the AI companies.
So now any of those apps, and any AI model, can read from the exact same memory.
Everything flows in, and then any model you like can draw on it.
So it doesn't matter which AI you're using — they're all working from the same picture of you.`,
  "33": `So these are the questions people keep asking about this.
Why are my chats all separate — why can't the AI just remember across them?
Why does the memory it does have feel so limited?
How do I move what I've built up in one AI over to another?
Every one of these questions comes back to the same root problem — memory that's stuck and isolated.
And vmem is basically our answer to all of them at once.`,

  "03": `So what actually is vmem?
The simplest way to put it — it's a memory that lives outside any one AI app, so all of them can share it.
Normally, if you tell ChatGPT something about yourself, or upload a document, or jot a quick voice note, that just stays stuck in that one app and nowhere else.
With vmem, it gets saved once, in a place that's yours.
And it doesn't just dump the raw text — it works out what the note's actually about, tags it, and links up the people and projects it mentions.
So then, from a totally different app — Claude, your phone, wherever — you ask a question, and it doesn't just find that one note, it pulls back the whole connected picture.
So the whole idea is: you tell it something once, and it's there everywhere, for good.`,
  "04": `So how does it actually work?
It's four steps, and it all happens on its own.
First, you capture something — that just means saving it, and it can be anything from anywhere: a chat message, a document, a voice note.
Then vmem reads it, tags what it's about, and pulls out the people and things mentioned — so it understands the note, not just stores it.
Next, it links that memory up to the related ones you already have, so they're all connected.
And finally, recall — when you ask a question later, it hands back the whole connected picture, and tells you where each bit came from.
So really, you capture things once, and vmem quietly does the rest in the background.`,
  "17": `So this is what changes under the hood, and it's a big one.
Normally, every time you ask an AI something, it has to rebuild all your context from scratch — go search Linear, open SharePoint, dig through OneDrive and Notion, and reason over all of it again, every single time.
That's slow, and it burns a load of computing power on every question.
With vmem, all that connecting and reasoning has already been done and stored.
So instead of rebuilding everything each time, it's just one quick lookup — the answer's already sitting there, connected and ready.
So you get faster answers, and it costs a fraction as much to run.`,
  "05": `So under the hood, your memories aren't just a flat list sitting in a row.
They're all connected up, like a web.
Every memory links to the topics it's about, the people and things it mentions, and the other memories it relates to.
So when you pull one thing back, everything around it comes with it — one memory leads you to the next.
That's what lets it hand back the full picture, instead of just one isolated note.`,
  "06": `So this is something none of the other memory tools out there do, and it's probably my favourite bit.
Normally, when an AI "remembers" something and brings it up, you've got no idea why it picked that — it just appears, and you have to trust it.
With vmem, every single time it pulls a memory back, it tells you exactly why — it's the same topic, or the same person, or it came from the same conversation.
And it puts a score on each of those reasons, so you can see how strong the match is.
So you're never just trusting a black box — you can look at any answer and see the actual reasons behind it.
And that really matters, cos if this thing's going to act on your memory, you want to be able to check its working.`,
  "07": `So the next question is, how does stuff actually get into vmem?
And the answer is from basically everywhere you already work.
There's a browser extension that quietly saves the pages you visit and your history.
On your phone, you just talk, and it turns your voice into a memory.
Inside Claude, it saves and reads things on its own as you chat, without you doing anything.
And any file you upload — a PDF, a doc — becomes searchable straight away.
So you're not sitting there manually feeding it; wherever you are, it's all flowing into the same place.`,
  "08": `So here's a clever bit — vmem doesn't just sit there waiting for you.
While you're away, overnight, it goes back over everything it's stored and tidies it up on its own.
It spots contradictions — say you told it two things that don't line up — it notices duplicates and merges them, and it slowly builds a picture of how you actually work.
But it never changes anything behind your back.
Instead, it shows you what it found as suggestions, and you just approve or reject each one.
And if approving each one gets tedious, you can set a confidence bar and let the high-confidence ones through automatically — still your rules, just less clicking.
So it's quietly getting smarter overnight, but you're always the one in control of what sticks.`,
  "09": `So this is the control side of things, and it's important.
Nothing ever gets changed or overwritten silently — every single change comes to you first to approve.
You can pin the things that really matter so they always stick around, hide anything that's wrong, and set temporary stuff to expire on its own.
And there's a full history of every change, so you can always see what happened and undo it.
So the whole point is nothing happens to your memory that you didn't approve yourself.`,
  "10": `So a quick word on privacy, since this is a big one for everyone.
By default, everything you capture is personal — it's yours, and nobody else sees it.
But you can also have team spaces, where a group shares the same skills, a shared wiki, and shared files.
So the stuff that's meant to be shared across the team is shared — but your personal memories always stay private to you.
You're never accidentally exposing your own notes to everyone.`,

  "27": `So we're not the only ones trying to solve this — let me quickly show how others approach it.
The most basic way is search-and-paste: you find a few notes that look relevant and paste them into the AI yourself.
A step up is mapping how things connect first, then pulling in the related pieces too.
And the most refined version is carefully handing the AI exactly the right context, nothing more, nothing less.
But it all comes down to the same thing — context.
Get the context right, and the answers are both more accurate and cheaper, every time.`,
  "28": `So here's where those other approaches fall short.
Their memories tend to just sit there on their own, with no links between them.
There's no tie back to your real data — the documents and tools the memory actually came from.
And nothing ever goes back over them to clean them up or improve them.
So what you end up with is basically a flat pile of sticky notes — it's better than nothing, but it doesn't really understand you.`,
  "29": `So this is where vmem's genuinely different.
It goes back over your memories overnight and improves them, like I showed with dream mode.
It brings things back based on how they actually connect to each other — not just what happens to look similar on the surface.
And it stays in sync with your real data, so as your documents and tools change, the memory keeps up.
So it's not a static pile of notes — it's a living thing that gets better over time.`,
  "11": `So here's vmem next to the main alternatives — the dedicated memory tools, Mem0 and Supermemory, and the big providers' own memory, ChatGPT and Claude.
And I'll be honest — a lot of these rows are going yes across the board now.
Connecting memories, working in the background, improving on their own — everyone's racing on that, and that's fine.
But look at the two rows where only vmem has a tick.
It's the only one that shows you why each memory matched — everyone else just hands it over and you trust it.
And it's the only one that asks you before it overwrites anything, instead of quietly changing your memory behind your back.
So I'm not claiming we're the only ones with memory — we're the ones that are transparent about it and keep you in control.`,
  "24": `So on results — this is early internal testing, and testing's still ongoing.
Two things are standing out so far.
First, it's using far fewer tokens — because it only sends the model the memories that matter, not everything, each question costs a fraction of what it otherwise would.
And second, when I ask it something, it's pulling back the right memories the large majority of the time.
And honestly, the nicest part — I've been running it on my own Claude for weeks, and giving it access to all my browsing history and bookmarks has been brilliant.
When everything's in one place like that, nothing's invisible to it any more.`,
  "19": `So this isn't just a personal thing — it matters in pretty much every team.
Think about support: it'd remember a customer's whole history, so nobody's asking them to repeat themselves.
Healthcare — the context carries over between visits, so care doesn't start from scratch each time.
Finance — advice is grounded in the client's actual goal and investment strategy, not something generic.
And sales — a new rep just picks up exactly where the last one left off.
So it's the same core idea everyone - wherever there's context not worth losing.`,
  "21": `So a good example of where this could go is Eva.
She does bits of our work for us, but right now she doesn't really have a memory of her own.
The opportunity here is to plug vmem straight into her.
If we did, she'd remember every action she's taken, every task, every decision — instead of starting fresh each time.
So she'd build on everything that came before, and the more we used her, the sharper she'd get.
And that's really the point — it's what vmem could unlock for any agent, not just Eva.`,
  "23": `So why should you actually trust this with your data?
Three reasons.
First, you own it — you can view everything it's stored, edit it, or delete it whenever you want.
Second, it's private by default, so nothing's shared unless you choose to.
And third, it can run entirely on your own devices, so your data never even has to leave your machine.
So it's your memory, on your terms — you're not handing it over to anyone.`,

  "20": `So if you zoom right out, this becomes something bigger than a personal memory layer.
It becomes the company brain.
One shared, living memory for the whole organisation — every decision that's been made, every reason behind it, every source should get stored inside vmem.
And any person, or any AI agent, can think and access that shared memory.
So instead of knowledge being locked in people's heads and scattered across apps, it all lives in one place the whole company can draw on.`,
  "42": `So here's what that actually looks like.
Everyone has their own private web of memories — Maya's, Tom's, everyone's — and those stay personal to them.
But each of those webs plugs into one shared brain in the middle.
So the knowledge the team is meant to share lives in that brain, and anyone — or any AI — can think inside it.
To be really clear though: your own memories stay yours. It's only what you choose to share that feeds the common brain, so there's separate spaces for personal and company knowledge.`,
  "15": `So everything I've shown so far has been implemented — this is the actual product today, nothing mocked up.
You've got the live memory graph to see the connections, the dashboard to view stats, and all your memories in one place.
So this is genuinely what you'd be using day to day.
Let me actually walk you through it.`,
  "32": `So let me show you this live.
Every dot on screen is one of your memories.
Click on any of them, and you'll see everything that connects to it.
So you can literally explore your own memory as a map.`,
  "36": `So watch what happens with a single memory here.
Say you've got one about a trip to Japan.
On its own it's just one dot — but it links out to the place you booked, the ramen place you loved, the travel card you needed, and it keeps branching out from there.
Then when we zoom right out, you can see that whole cluster is just one little corner of a much bigger graph — everything vmem knows about you, all connected together.
So one memory is never really alone; it's part of the whole web.`,
  "37": `So on the web app, you can click into any single memory and it opens up three tabs.
The first, details, shows you what the memory's actually about — the tags on it, and where it originally came from.
History shows you how it's changed over time — every edit that's ever been made to it, so nothing's hidden.
And connections lists all the other memories that are linked to this one.
So you get the full story of any single memory, all in one place.`,
  "39": `So this is a mockup of everything I've talked about.
Here's the same question, asked to two completely different assistants — Claude and ChatGPT.
Normally they'd each give you their own answer based on whatever they happen to know.
But because they're both pulling from the same vmem memory, they give you the same answer, grounded in your actual stuff.
So the memory is the constant — it's yours — and the model is just the voice reading it out.
You can swap the model whenever you like and lose nothing.`,
  "34": `So there's a fair bit more to the app than just memories.
There are skills — basically reusable sets of instructions you can hand to any model, so you're not re-explaining how you want things done every time.
There's a wiki, for shared team knowledge.
And there are connectors, which pull your data in automatically from other places you already use.
So it's not just a memory store — it's the whole ecosystem for memory and context management, in one platform.`,

  "25": `So here's the big-picture thesis, and it's really the heart of why I think this matters.
Every AI model eventually catches up to every other one — they all get good, they all copy each other's features.
Software gets copied too.
So the question is, what's actually left that's yours, that a competitor can't just replicate?
And it's the memory — everything that's been learned about you and how you work, built up over months and years.
That's the bit that compounds, and it's the bit nobody else can copy.
So that's the bet, really: the model becomes a commodity, and the memory is the moat.`,
  "26": `So there's a flip side to that, and I want to be honest about it.
The more you build everything up around one single model provider, the more locked in you get.
And that lock-in is a real cost — it's what makes it painful to ever switch away.
So anything you set up should be easy to move, not trapped.
And that's exactly why vmem itself is 100% open source, free, and self-hostable — you can pick it up and run it anywhere, so you're never stuck with it.`,
  "41": `So this isn't just me saying any of this.
The big companies — the ones paying for AI by the token, at real scale — are all pulling back.
Meta hit 73 trillion tokens a month, then scrapped the internal leaderboard that was pushing usage — their CTO literally said all motion is not progress.
Uber burnt through its whole year's AI budget in four months.
Coinbase halved its spend just by routing the routine work to cheaper models.
And Perplexity runs about twenty different models, always picking the cheapest one that can do the job.
And here's the key thing — this isn't people using less AI.
Usage is still climbing, the token counts are still going up.
They're just being smart about it: cheap models for the routine stuff, and the expensive ones saved for when it really matters.
So nobody's betting everything on one model any more.
And that whole approach only works if your memory travels with you, instead of being locked inside whichever model you happened to pick.

Sources: Meta — michaelparekh.substack.com/p/ai-meta-steps-back-from-ai-tokenmaxxing (15 Jun 2026); Uber — fortune.com/2026/05/26/uber-coo-ai-spending-tokens-claude-code (26 May 2026); Coinbase — finance.yahoo.com/markets/crypto/articles/coinbase-ceo-halved-ai-costs-130000536.html (27 Jun 2026); Perplexity — x.com/AravSrinivas/status/2070929445251400092.`,

  "35": `So this is the real test of whether you're actually in control — do you control the model, or does it control you?
Here's the scenario: say Claude shut down tomorrow, or doubled its price, or changed its terms like we have seen with Fable recently.
If everything you've built is trapped inside it, you're stuck.
But if your memory lives in vmem, you just swap in another model and carry on — all your built-up expertise comes with you.
As the CEO of Microsoft recently put it — you should be able to swap out the general-purpose model without losing the "company veteran" expertise built into your own system.
So that's the whole game: own the memory, and the model becomes something you can freely swap.`,

  "18": `So here's another shift that's happening — AI models are going local, meaning they run on your own device instead of in the cloud.
The open, free ones are catching up to the big paid ones every few months.
Small ones already run on your phone.
And there's a top-tier, Opus-level model that runs on a single machine today.
So pretty soon, every laptop just ships with a capable model built in.
Which matters for the next point.`,
  "40": `So here's why local models matter beyond just cost.
A lot of companies can't use Claude or ChatGPT at all — not by choice, but because the rules forbid it.
Think banks, hospitals, law firms, government — they simply can't send customer, patient, or case data to a third-party AI. It's off the table for them.
The unlock is a local model running on their own servers — every prompt and answer stays inside their walls, nothing leaves, and nothing trains anyone else's model.
And open models keep closing the gap with the frontier labs, so soon that same power arrives, and it stays completely private.
So you get frontier intelligence with zero data leaving the building — and vmem already runs on them, on-device.`,

  "30": `So let me be straight with you about where vmem falls short, cos nothing's perfect.
Answers can be a bit slower, because it's following all those connections rather than just grabbing the first match.
Basic memory layers that only do quick lookups will beat it on raw speed.
And the big AI labs are improving their own memory features fast, so they'll close some of this gap.
So I'm not going to oversell it — those are the real trade-offs.`,
  "31": `So given the labs are catching up, the fair question is — what actually keeps vmem ahead?
And it's this: they might get faster, they might match the features.
But what they can't hand you is ownership, portability, and independence — your memory being genuinely yours, movable, and not tied to any one of them.
That's the part that stays with vmem no matter how good they get.
So we're not really competing on speed — we're competing on who owns the memory, and that's you.`,
  "22": `So one last thing on where this goes.
Whatever comes next — smart glasses, a watch, robots, a full digital twin of you — you won't be setting any of it up from scratch.
You just connect it to vmem, and your whole self is already there, ready to go.
So the memory outlives every device and every model — it's the one thing that carries forward.`,
  "13": `So this is everything vmem is, all on one board.
Down the left is how your data gets in: the MCP connector that plugs into any AI, the browser extension pulling your history and bookmarks, and connectors for the tools you already use — Google Drive, OneDrive, Dropbox, Gmail, Notion, Linear, GitHub.
Then there's how you actually use it: the web app to browse and search your memory, the mobile app for private access on the go, a wiki for long-form docs, and codebases so it understands how your code fits together.
And the capabilities on top: skills you define once and use everywhere, files that act as a proper file system for your agents, profiles to keep personal and work separate, and a developer SDK to drop memory into your own agents.
So the point is this isn't one narrow feature — it's a whole platform, everything you need for memory in one place.`,
  "16": `So one last thought to leave you with.
Last year the model everyone used for web search was Perplexity.
Yesterday it was ChatGPT after they implemented their own web search.
Today it's Claude for its agentic capabilities.
Tomorrow — who knows.
The model you're using is going to keep changing.
But your memory — everything you've built up — that shouldn't have to change with it.`,
  "12": `So that brings us to what's next — and honestly, this is just the start.
The foundation's all there already: connected memory, recall you can trust, Dream Mode, workspaces, and the first connectors.
What's coming is on the right — more connectors to pull from even more of your tools, smarter recall that follows deeper links and lets old context fade, and finer access control so each tool or teammate gets exactly what they need.
And zooming out, the whole memory-layer space is at its earliest days — a bit like when ChatGPT first landed: rough, but improving fast.
You can already see it happening — Claude now references your past chats and memories.
So that's vmem — thanks for listening.`,
  "14": `Right, that's me.
What questions have you got?`,
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

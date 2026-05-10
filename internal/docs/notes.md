https://www.geeksforgeeks.org/nlp/what-is-bm25-best-matching-25-algorithm/

- bm25 best matching algorithm

modelled after the brain would - smart forgetting, decay, recency bias, context rewriting, etc
your own memory database, polished version of graphrag
https://www.youtube.com/watch?v=GETMfbGWc0k&t=4s

https://www.youtube.com/watch?v=dp_MeH3-Kbs&t=9s
problems with trad memory

- token bloat
- dumb retrieval
- static fact dbs
- high cost at scale
- cold start

how honcho 3 works

- ingestion reasoning - each message -> parallel explicit fact extraction. no bottlenecks. cheap per message
- dreaming agent (async) - background agent consolidates facts, fills gaps, forms hypotheses - like human sleep memory
- representation store - stores observations about users/agents across all sessions in a structured, queryable format
- reasoning agent - agentic loop searches and chain facts across time. returns context in around 200ms or 10k tokens.

key takeaways

- honcho reasons, others retrieve - the neuromancer engine chains facts across time - no other memory system does this at scale
- sota at locomo at 89.9%, beats mem0 by 23 points overall and 33 points on multi-hop reasoning tasks
- fastest + most accurate - ~200ms latency with best in class accuracy, no trade off between speed and quality
- memory that compounds - unlike mem0 or vector dbs, honcho's user model gets smarter the more it interacts

https://x.com/karpathy/status/2036836816654147718
karpathy knowledge tweet

- memory is also distracting for the models
- single question from 2 months ago about a topic can keep coming up as a deep interest of the user with undue mentions in perpetuity
- tries to hard to know and remember everything about you
- knowing which memories to drop is just as important as knowing which memories to prioritise
- decay mechanism needs to be there, based on factors like recency, access frequency, connectedness - helps keep the clutter like that out - pruning is important
- when agent memory stays locked inside a single model provider, transferring it often carries over both useful experience and model-specific bias, which can end up hurting performance instead of improving it
- memory should not just be a write-heavy system, there needs to be some deletion policy. one fix can be to stop thinking of memory as a flat store and instead enforce a minimal contract at write time. every memory must include a type (preference / fact / one-off query / intent), a TTL or decay rule (e.g. expires, degrades, or requires revalidation), a confidence score (how strong the signal is)
- then at retrieval time, not just a similarity search, a hard filter should be applied to: discard expired or low confidence items, down-rank old or single occurence signals, never promote "one off queries" into persistent traits. this should eleminate most of the "why is this coming up again?" effect
- key shift is: bad personalisation is not a retrieval problem, its a memory hygiene problem. without constraints at write time, the system accumulates noise faster than it can filter it. Most issue disappear once memory is treated as a governed system instead of an append-only log.
- real memory is continuous compression, forgetting useless stuff. forgetting useless information is economically rational. data and tokens are not cost free. eventually llm drivers will truly model costs.
- decay + reinforcement
- ontology system is the nouns and verbs that make up your system
- it maps everything that runs your business so agents can make better decisions, they have more context
- agent has context about how the business operations, not just the data, it can see what things are connected to what and why they are connected
- it orchestrates those complex actions in the backend
- ontology is really the context of how your businesses operate because LLMs were not trained on your business data or processes
- so this is what is most important: the ontology to model the data, the logic, and the actions to drive decisions
- the fix is decay + reinformacement, memories that are not revisited should fade, not persist at full weight forever
- missing piece is consolidation, humans promote episodic memories to semantic through repetition and emotional salience. current memory systems skip that step entirely and they store everything as equally permanent facts. i think the hard problem is both "what to forget" and more importantly "what to promote"
- they challenge is models have very limited access to total context, they live through the prompts you provide which creates this annoying "over-rotation" towards memory
- potential solution: organising knowledge as domain -> topic -> subtopic -> context with index.md summaries at each level (4 condensation orders). the ontological structure means the system can answer what do I know about auth without scanning every entry, it reads the domain summary first then drills down only if needed
  https://theinnerfrontier.com/
  https://atlasforge.me/writing/memory-architecture-for-agents/

https://www.heymya.ai/demo

- company know how is scattered across people, slack, docs, tickets, databases
- ai agents cant operate like that, people can't either, as agents create more output, teams need a company brain

https://x.com/DhravyaShah/status/2049324612635562492
built a filesystem search that basically searches files with semantic grep and then has a sync engine to save learnings to supermemory

graph dbs

- dgraph https://docs.dgraph.io/dgraph-overview
- kuzu https://github.com/kuzudb/kuzu

Most real systems use more than one. A common pattern is filesystem or document DB for the source of truth, vector DB for retrieval, and sometimes a graph DB on top for relationship traversal.

https://medium.com/@jayanthnenavath2k19/building-ai-agents-with-long-term-memory-a-neo4j-implementation-of-mem0-ef56ae240e1b

local model for unified schema based information extraction

- used for the inngestion https://github.com/fastino-ai/GLiNER2 as described in https://www.youtube.com/watch?v=qMV64p-4Deo&t=8s
- it unifies named entity recognition, text classification, structured data extraction and relation extraction into a single 205m param model
- provides efficient CPU based inference without requiring complex pipeline or external API dependencies
- one model 4 tasks
- cpu first, local processing
- seems to be python only for now

neo4j agent memory package (python only)

- https://www.youtube.com/watch?v=qMV64p-4Deo
- https://github.com/neo4j-labs/agent-memory
- https://create-context-graph.dev/
- https://neo4j.com/blog/developer/meet-lennys-memory-building-context-graphs-for-ai-agents/
- https://create-context-graph.dev/docs/tutorials/customizing-domain-ontology
- https://neo4j.com/labs/agent-memory/
- https://github.com/neo4j-labs/agent-memory/tree/main/examples/full-stack-chat-agent
- https://github.com/neo4j-labs/agent-memory/tree/main/examples/lennys-memory
- https://neo4j.com/blog/developer/meet-lennys-memory-building-context-graphs-for-ai-agents/
- Every domain ontology inherits from \_base.yaml, which defines shared POLE+O (Person, Organization, Location, Event, Object) entity types. When the ontology is loaded, base entities and relationships are merged into your domain definition automatically.
- What Is a Domain Ontology? The ontology is the blueprint for your entire application. It determines:
  - Entity types -- the kinds of nodes in your graph (e.g., Patient, Provider, Facility).
  - Relationships -- how entities connect (e.g., DIAGNOSED_WITH, TREATED_BY)
  - Agent tools -- Cypher queries the AI agent can execute to answer questions
  - Document templates -- prompts for generating synthetic documents
  - Decision traces -- step-by-step reasoning patterns for the agent
  - Demo scenarios -- sample prompts to showcase the app
  - Visualization settings -- node colors, sizes, and default queries
- mcp has 2 types of tools - core and extended
- core has essential read/write - memory search, memory get context, memory store message, memory add entity, memory add preference, memory add fact
- extended has full surface adding: conversation history, entity deatils, graphs export, relationship creation, reasoning traces, observability, read only Cypher

model on openrouter for reranking/searching through data and finding answers, 0.001 per query https://cohere.com/blog/rerank-3pt5

- rerank 3.5 finds the most relevant data to answer questions by using a method called "cross encoding" where the model comptues a score for a document in relation to a user question
- this enables highly accuraet information understanding, better than traditional keyword and embedding search
- step 1 retrieval -> prompt augmentation -> generation
- search systems fail to retrieve relevant info when users ask what they want returned - this is due to trad systems lacking the ability to reason
- apparently 23% better than hybrid search and 30% better than BM25

graph based long term memory - how agentic workflows adapt through experience

- https://www.youtube.com/watch?v=qMV64p-4Deo&t=8s

building ai agents with long term memory - a neo4j implementation of mem0

- https://medium.com/@jayanthnenavath2k19/building-ai-agents-with-long-term-memory-a-neo4j-implementation-of-mem0-ef56ae240e1b
- The difference between information and intelligence is memory
- Mem0 bridges this gap by creating AI systems that don’t just process queries — they understand, remember, and evolve with their users.

memory architecture for ai agents - from first principles

- https://atlasforge.me/writing/memory-architecture-for-agents/
- basically goes over his openclaw setup then memory architecture
- 3 ways to organise files - behavioral, relational, and technical
- 4 types of agent memory, unlike what most memory system implement - semantic (factual knowledge)
  - episodic memory - what happened
    - time stamped records of events, conversations, and decisions
    - this is the daily logs
    - episodic memory is when aware - not just what you know, but when you learned it and in what context
    - decisions without context are random rules
    - episodes memory preserves teh why
    - when i see "use static HTML for articles", the episodic entry tells me it was a performance decision, not an aesthetic one
  - semantic memory - what you know
    - domain knowledge, research findings, facts
    - this is the type most systems implement - and implement badly as they treat it as a KV store
    - key addition - confidence scores and sources
    - not all knowledge is equally reliable
    - a fact from direct observation is different from soemthing mentioned in passing
    - tracking this prevents stale or unreliable information from being treated as ground truth
  - procedural memory - how to do things
    - learned workflows, tool preferences, optimised sequences
    - this is the most undervalued types
    - everytime an agent figures out the right way to do something, that knowledge should persist
    - proc memory is a scar tissue - its the accumulated "how to actually do this" that prevents repeating mistakes
    - without it, every session rediscovers the deployment process from scratch
  - relational memory - who you know
    - people, their preferenes, your history with them, how they communicate
    - this is the memory type that makes an agent feel like it actually knows you
    - most agent memory systems ignore relational memory, resulting in every interaction that feels like talking to a stranger who read your file
    - the relationship resets every session, but with relational memory, the agent knows not just about you but what working with you is like
- memory decay and curation
  - not all memories are equal, and memories that aren't maintained eventually rot
  - a decision made yesterday is more relevant than once made 3 months ago
  - a frequently referenced integration detail matters more than one used once
  - memory without decay becomes noise - a growing pile where important things get buried under trivial ones
  - but the curation problem is real, someone has to decide what is worth keeping. we have tried 3 approaches:
    - manual curation
      - jonny periodically reviews memory and removes stale entries
      - this produces the highest quality memory but doesn't scale
      - it happens when it happens, which means it sometimes doesn't happen for hours
    - auto summarisation
      - at the end of each day, the daily log gets a summary
      - weekly, the daily summaries get rolled up
      - monthly, the weekly summaries get compressed
      - each level of compression loses detail but preserves decisions and outcomes
    - the memory decay review
      - a period pass where every entry in memory list gets asked if it is still true? is it still relevant? when was this last useful?
      - entries that fail all 3 get pruned, this is the "forget" mechanism that most systems lack entirely
      - forgetting is a feature, not a bug
      - an agent that remembers everything performs worse than one that remembers the right things
      - the context window is finite
      - every stale entry displaces a relevant one
- multi-agent memory. everything above works for a single agent, when you have multiple agents, this breaks
  - scenario: agent A handles customer emails and learns that a user is frustrated about billing, agent B handles the support queue and has no idea.
  - agent A's relational memory about this customer is invisible to agent B - this is an issue with file based memory, you need shared memory across these agents
- only 3 api methods: remember, recall, forget
- https://atlasforge.me/engram/
- memory is the diff between agent vs chatbot. chatbots answer questions. agents build on yesterdays work but only if it can remember yesterdays work

For a uni project, just document it — do not roll your own. Two reasons:

Encryption at rest is genuinely already solved. AES-256 via Aura is the same answer a real production system would give an auditor. "We rely on the managed provider's encryption at rest, certified under ISO 27001 and SOC 2" is a perfectly defensible security claim and is exactly the wording in real corporate security reviews. A marker who knows the field will accept this; one who does not is not going to award extra marks for a homegrown reimplementation of something the platform already does.

Application-layer encryption would actively hurt vmem. If you encrypt node properties before writing to Neo4j, you lose the graph's ability to query, filter, or index on those fields. For a memory retrieval system, that is the wrong trade — you would be encrypting the very content you want to traverse and rank. You would also be on the hook for key management (where do keys live? rotation? loss = total data loss?), which is the part of cryptography that goes wrong in practice, even in industry.

Where I would spend the security effort instead. For a personal memory system, the much more interesting and defensible controls are:

Per-user authorization — making sure user A can never traverse to user B's memories, both in Convex queries and in Neo4j Cypher (every query must be scoped by userId). This is the real risk in a memory system; encryption at rest does nothing against it.
Audit trail — who accessed which memory when (you already have Context Trace per the project notes, which is half this story).
Data minimisation — what you choose not to store (e.g. flagging PII before save, suppress/expire lifecycle, which is already a vmem differentiator).
Secrets handling — Neo4j credentials, OpenRouter API key, Clerk keys — kept in env vars, not committed, rotated.
A security write-up that says "At rest: handled by Aura (AES-256). In transit: TLS enforced by Aura. The interesting controls we implemented are tenant isolation, audit trail, and lifecycle-based data minimisation" is a much stronger masters-level answer than "we re-encrypted everything ourselves".

What to put in your report
A short paragraph along these lines:

Data at rest is encrypted using AES-256 by the managed Neo4j Aura platform, with key management handled by the underlying cloud provider's KMS. This is enabled by default on all Aura tiers, including the Free tier used for this project, and is certified under ISO/IEC 27001:2022 and SOC 2 Type 2. Stronger guarantees (Customer Managed Keys, signed DPA) are available on paid Aura tiers and would be required before processing real personal data in a production deployment.

That covers the security point honestly, shows you understand the boundary between what is covered and what would need an upgrade, and frees up your time for the controls that actually matter for vmem.

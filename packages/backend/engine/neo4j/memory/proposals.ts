/**
 * `:ProposedUpdate` lifecycle: create / list / resolve.
 *
 * Two flavours live here:
 * - V2 fact-extraction proposals (kind ∈ {update, delete}) — bound to the
 *   target memory via `:UPDATE_FOR`. These are the legacy "memory says X
 *   but the user just stated Y" path.
 * - Dream-mode synthesis proposals (kind ∈ {insight, connection,
 *   contradiction, anomaly}) — carry `sourceMemoryIds` + their own title,
 *   bound to sources via `:DERIVED_FROM`. Approving an insight/connection
 *   materialises a NEW :Memory (type='knowledge', source='dream-mode');
 *   contradiction/anomaly are dismiss-only.
 *
 * `resolveProposal` is decomposed into one lookup helper plus four
 * kind-handlers that each own their own `logEvent` call. The dispatch is
 * a switch on `kind` — the kinds genuinely diverge, so a generic apply()
 * would just be a soup of branchy flags.
 */

import crypto from "node:crypto";
import { type Driver, type Session } from "neo4j-driver";
import { computeContentHash, toMemoryWithTags, toSnapshot } from "./mappers";
import { logEvent, withSession } from "./shared";
import {
  isProposedUpdateKind,
  type ProposalSource,
  type ProposedUpdateKind,
  type ProposedUpdateNode,
} from "./types";

export async function createProposedUpdate(
  driver: Driver,
  params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
  },
): Promise<ProposedUpdateNode> {
  return withSession(driver, async (session) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId})
       CREATE (p:ProposedUpdate {
         id: $id,
         memoryId: $memoryId,
         proposedContent: $proposedContent,
         proposedTitle: null,
         reason: $reason,
         kind: 'update',
         status: 'pending',
         createdAt: $now,
         resolvedAt: null,
         sourceMemoryIds: [],
         confidence: null,
         source: 'v2-extraction'
       })
       CREATE (p)-[:UPDATE_FOR]->(m)
       RETURN p`,
      {
        id,
        memoryId: params.memoryId,
        proposedContent: params.proposedContent,
        reason: params.reason,
        now,
      },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) throw new Error("Failed to create proposed update");
    const props = firstRecord.get("p").properties;
    return {
      id: props.id,
      memoryId: props.memoryId,
      proposedContent: props.proposedContent,
      proposedTitle: null,
      reason: props.reason,
      kind: "update",
      status: props.status,
      createdAt: props.createdAt,
      resolvedAt: null,
      sourceMemoryIds: [],
      confidence: null,
      source: "v2-extraction",
      memorySnapshot: null,
      sourceMemorySnapshots: [],
    };
  });
}

/**
 * V2 fact-extraction emits "delete this old memory because the user just
 * stated a contradicting fact" → recorded as a `:ProposedUpdate` with
 * `kind: 'delete'` so the user explicitly approves before destructive
 * action. Mirrors `createProposedUpdate` shape so the existing list /
 * resolve plumbing handles both.
 */
export async function createProposedDelete(
  driver: Driver,
  params: { memoryId: string; reason: string },
): Promise<ProposedUpdateNode> {
  return withSession(driver, async (session) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId})
       CREATE (p:ProposedUpdate {
         id: $id,
         memoryId: $memoryId,
         proposedContent: '',
         proposedTitle: null,
         reason: $reason,
         kind: 'delete',
         status: 'pending',
         createdAt: $now,
         resolvedAt: null,
         sourceMemoryIds: [],
         confidence: null,
         source: 'v2-extraction'
       })
       CREATE (p)-[:UPDATE_FOR]->(m)
       RETURN p`,
      {
        id,
        memoryId: params.memoryId,
        reason: params.reason,
        now,
      },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) throw new Error("Failed to create proposed delete");
    const props = firstRecord.get("p").properties;
    return {
      id: props.id,
      memoryId: props.memoryId,
      proposedContent: "",
      proposedTitle: null,
      reason: props.reason,
      kind: "delete",
      status: props.status,
      createdAt: props.createdAt,
      resolvedAt: null,
      sourceMemoryIds: [],
      confidence: null,
      source: "v2-extraction",
      memorySnapshot: null,
      sourceMemorySnapshots: [],
    };
  });
}

export async function listProposedUpdates(
  driver: Driver,
  userId: string,
): Promise<ProposedUpdateNode[]> {
  return withSession(driver, async (session) => {
    // Pull the target memory's title + content alongside each proposal so
    // the proposals UI can render a diff without a round-trip per row. For
    // synthesis proposals (sourceMemoryIds non-empty), also collect the
    // source memories so the UI can render the "derived from" panel.
    //
    // OPTIONAL MATCH on UPDATE_FOR because synthesis proposals carry an
    // empty memoryId / no UPDATE_FOR edge — ownership then falls through
    // to the source memories' userId via sourceMemoryIds below.
    const result = await session.run(
      `MATCH (p:ProposedUpdate {status: 'pending'})
       OPTIONAL MATCH (p)-[:UPDATE_FOR]->(m:Memory)
       WITH p, m
       OPTIONAL MATCH (src:Memory {userId: $userId})
         WHERE src.id IN coalesce(p.sourceMemoryIds, [])
       WITH p, m,
            collect(DISTINCT { id: src.id, title: src.title, content: src.content }) AS sources
       WHERE (m IS NOT NULL AND m.userId = $userId)
          OR size([s IN sources WHERE s.id IS NOT NULL]) > 0
       RETURN p,
              m.title AS memoryTitle,
              m.content AS memoryContent,
              [s IN sources WHERE s.id IS NOT NULL] AS sourceSnaps
       ORDER BY p.createdAt DESC`,
      { userId },
    );

    return result.records.map((record) => {
      const props = record.get("p").properties;
      // `kind` is absent on pre-V2 proposals — coerce to "update".
      const rawKind = String(props.kind ?? "update");
      const kind: ProposedUpdateKind = isProposedUpdateKind(rawKind)
        ? rawKind
        : "update";

      const titleRaw = record.get("memoryTitle");
      const contentRaw = record.get("memoryContent");
      const memorySnapshot =
        typeof titleRaw === "string" && typeof contentRaw === "string"
          ? { title: titleRaw, content: contentRaw }
          : null;

      const rawSources = record.get("sourceSnaps");
      const sourceMemorySnapshots: {
        id: string;
        title: string;
        content: string;
      }[] = Array.isArray(rawSources)
        ? rawSources.flatMap((s: unknown) => {
            if (typeof s !== "object" || s === null) return [];
            const id = Reflect.get(s, "id");
            const title = Reflect.get(s, "title");
            const content = Reflect.get(s, "content");
            if (
              typeof id === "string" &&
              typeof title === "string" &&
              typeof content === "string"
            ) {
              return [{ id, title, content }];
            }
            return [];
          })
        : [];

      const rawSourceIds = props.sourceMemoryIds;
      const sourceMemoryIds: string[] = Array.isArray(rawSourceIds)
        ? rawSourceIds.filter(
            (x: unknown): x is string => typeof x === "string",
          )
        : [];

      const rawConfidence: unknown = props.confidence;
      const confidence: number | null =
        typeof rawConfidence === "number" ? rawConfidence : null;

      const rawSource = props.source;
      const source: ProposalSource =
        rawSource === "dream-mode" ? "dream-mode" : "v2-extraction";

      return {
        id: props.id,
        memoryId: props.memoryId ?? "",
        proposedContent: props.proposedContent ?? "",
        proposedTitle:
          typeof props.proposedTitle === "string" ? props.proposedTitle : null,
        reason: props.reason ?? "",
        kind,
        status: props.status,
        createdAt: props.createdAt,
        resolvedAt: props.resolvedAt ?? null,
        sourceMemoryIds,
        confidence,
        source,
        memorySnapshot,
        sourceMemorySnapshots,
      };
    });
  });
}

interface ProposalLookup {
  kind: ProposedUpdateKind;
  proposedTitle: string;
  proposedContent: string;
  sourceMemoryIds: string[];
  confidence: number | null;
  sourceProfileId: string | null;
  /** `targetId` if UPDATE_FOR-bound, else first source memory id. */
  memoryId: string;
  /** UPDATE_FOR target's userId, else first source's userId. */
  userId: string;
}

interface ResolveResult {
  status: string;
  memoryId: string;
  kind: ProposedUpdateKind;
  /** Set when approve materialized a new memory (synthesis kinds). */
  materializedMemoryId?: string;
}

/**
 * Look up a proposal by id. For legacy update/delete kinds we expect a
 * UPDATE_FOR edge to the target memory; synthesis proposals have no
 * UPDATE_FOR edge but carry sourceMemoryIds — we resolve the
 * userId/profileId from the first source.
 */
async function lookupProposalContext(
  session: Session,
  proposalId: string,
): Promise<ProposalLookup | null> {
  const lookup = await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     OPTIONAL MATCH (p)-[:UPDATE_FOR]->(target:Memory)
     OPTIONAL MATCH (firstSource:Memory)
       WHERE firstSource.id = head(coalesce(p.sourceMemoryIds, []))
     RETURN
       coalesce(p.kind, 'update') AS kind,
       p.proposedTitle AS proposedTitle,
       p.proposedContent AS proposedContent,
       coalesce(p.sourceMemoryIds, []) AS sourceMemoryIds,
       p.confidence AS confidence,
       target.id AS targetId,
       target.userId AS targetUserId,
       firstSource.userId AS sourceUserId,
       firstSource.profileId AS sourceProfileId`,
    { proposalId },
  );

  const lookupRecord = lookup.records[0];
  if (!lookupRecord) return null;

  const rawKind = String(lookupRecord.get("kind"));
  const kind: ProposedUpdateKind = isProposedUpdateKind(rawKind)
    ? rawKind
    : "update";

  const targetIdRaw = lookupRecord.get("targetId");
  const targetUserIdRaw = lookupRecord.get("targetUserId");
  const sourceUserIdRaw = lookupRecord.get("sourceUserId");
  const sourceProfileIdRaw = lookupRecord.get("sourceProfileId");
  const sourceIdsRaw: unknown = lookupRecord.get("sourceMemoryIds");
  const sourceMemoryIds: string[] = Array.isArray(sourceIdsRaw)
    ? sourceIdsRaw.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const firstSourceId = sourceMemoryIds[0] ?? "";

  const memoryId =
    typeof targetIdRaw === "string" && targetIdRaw.length > 0
      ? targetIdRaw
      : firstSourceId;
  const userId =
    typeof targetUserIdRaw === "string" && targetUserIdRaw.length > 0
      ? targetUserIdRaw
      : typeof sourceUserIdRaw === "string"
        ? sourceUserIdRaw
        : "";

  const proposedTitleRaw = lookupRecord.get("proposedTitle");
  const proposedContentRaw = lookupRecord.get("proposedContent");
  const confidenceRaw = lookupRecord.get("confidence");

  return {
    kind,
    proposedTitle:
      typeof proposedTitleRaw === "string" && proposedTitleRaw.length > 0
        ? proposedTitleRaw
        : "Untitled synthesis",
    proposedContent:
      typeof proposedContentRaw === "string" ? proposedContentRaw : "",
    sourceMemoryIds,
    confidence: typeof confidenceRaw === "number" ? confidenceRaw : null,
    sourceProfileId:
      typeof sourceProfileIdRaw === "string" ? sourceProfileIdRaw : null,
    memoryId,
    userId,
  };
}

async function applyRejection(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = 'rejected', p.resolvedAt = $now`,
    { proposalId, now },
  );
  if (lookup.memoryId.length > 0) {
    await logEvent(
      session,
      lookup.memoryId,
      "proposal_rejected",
      "api",
      { kind: lookup.kind },
      null,
    );
  }
  return { status: "rejected", memoryId: lookup.memoryId, kind: lookup.kind };
}

async function applyDeleteApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  // Approving a delete proposal hard-deletes the memory and all its chunks.
  // The proposal itself is also removed (DETACH DELETE on the memory takes
  // its UPDATE_FOR edge with it).
  await session.run(
    `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
     DETACH DELETE c`,
    { memoryId: lookup.memoryId, userId: lookup.userId },
  );
  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})-[:UPDATE_FOR]->(m:Memory)
     SET p.status = 'approved', p.resolvedAt = $now
     WITH m
     DETACH DELETE m`,
    { proposalId, now },
  );
  await logEvent(
    session,
    lookup.memoryId,
    "proposal_approved",
    "api",
    { kind: "delete" },
    null,
  );
  return { status: "approved", memoryId: lookup.memoryId, kind: "delete" };
}

async function applyUpdateApproval(
  session: Session,
  proposalId: string,
  now: string,
): Promise<ResolveResult | null> {
  const result = await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})-[:UPDATE_FOR]->(m:Memory)
     SET p.status = 'approved', p.resolvedAt = $now,
         m.content = p.proposedContent, m.updatedAt = $now
     WITH p, m
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     RETURN p.status AS status, m, collect(t.name) AS tags`,
    { proposalId, now },
  );
  const firstRecord = result.records[0];
  if (!firstRecord) return null;
  const memory = toMemoryWithTags(firstRecord);

  await logEvent(
    session,
    memory.id,
    "proposal_approved",
    "api",
    { kind: "update" },
    toSnapshot(memory),
  );

  return {
    status: String(firstRecord.get("status")),
    memoryId: memory.id,
    kind: "update",
  };
}

/**
 * V1 dismiss-only path for `kind ∈ { contradiction, anomaly }`. Both are
 * flags rather than new knowledge — contradictions need a human to pick
 * a winning side, anomalies ask the user to confirm whether the seed
 * memory belongs in the profile. Either way the proposal just clears.
 *
 * TODO(V2 contradiction): structured "pick winner" UI that hard-deletes
 * the memory the user did not pick.
 */
async function applyDismissOnlyApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = 'approved', p.resolvedAt = $now`,
    { proposalId, now },
  );
  if (lookup.memoryId.length > 0) {
    await logEvent(
      session,
      lookup.memoryId,
      "proposal_approved",
      "api",
      { kind: lookup.kind },
      null,
    );
  }
  return { status: "approved", memoryId: lookup.memoryId, kind: lookup.kind };
}

/**
 * Materialise a synthesis (insight/connection) proposal as a NEW
 * :Memory(type='knowledge', source='dream-mode') with :DERIVED_FROM
 * edges to each source. The new memory's id is returned so callers can
 * backfill its embedding and run enrichment.
 */
async function applySynthesisApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  if (lookup.sourceMemoryIds.length === 0) {
    // Malformed synthesis proposal — no sources to derive from. Reject
    // silently rather than create an orphaned memory.
    await session.run(
      `MATCH (p:ProposedUpdate {id: $proposalId})
       SET p.status = 'rejected', p.resolvedAt = $now`,
      { proposalId, now },
    );
    return {
      status: "rejected",
      memoryId: lookup.memoryId,
      kind: lookup.kind,
    };
  }

  const newMemoryId = crypto.randomUUID();
  const contentHash = computeContentHash(
    lookup.proposedTitle,
    lookup.proposedContent,
  );

  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = 'approved', p.resolvedAt = $now
     WITH p
     CREATE (m:Memory {
       id: $newMemoryId,
       userId: $userId,
       profileId: $profileId,
       title: $title,
       content: $content,
       type: 'knowledge',
       source: 'dream-mode',
       confidence: $confidence,
       status: 'active',
       createdAt: $now,
       updatedAt: $now,
       expiresAt: null,
       url: null,
       embedding: null,
       contentHash: $contentHash,
       sourceType: null,
       sourceId: null,
       storageId: null,
       mimeType: null,
       originalFilename: null,
       visitCount: 1,
       firstVisitAt: $now,
       lastVisitAt: $now
     })
     WITH m
     MERGE (s:Source {name: 'dream-mode'})
     CREATE (m)-[:FROM_SOURCE]->(s)
     WITH m
     UNWIND $sourceMemoryIds AS sid
     MATCH (src:Memory {id: sid, userId: $userId})
     MERGE (m)-[:DERIVED_FROM]->(src)`,
    {
      proposalId,
      now,
      newMemoryId,
      userId: lookup.userId,
      profileId: lookup.sourceProfileId,
      title: lookup.proposedTitle,
      content: lookup.proposedContent,
      confidence: lookup.confidence,
      contentHash,
      sourceMemoryIds: lookup.sourceMemoryIds,
    },
  );

  await logEvent(
    session,
    newMemoryId,
    "created",
    "dream-mode",
    { kind: lookup.kind, source: "synthesis-approve" },
    toSnapshot({
      title: lookup.proposedTitle,
      content: lookup.proposedContent,
      type: "knowledge",
      status: "active",
      confidence: lookup.confidence ?? 0,
      tags: [],
    }),
  );

  return {
    status: "approved",
    memoryId: newMemoryId,
    materializedMemoryId: newMemoryId,
    kind: lookup.kind,
  };
}

/**
 * Merge approval — reconsolidation. Creates the consolidated :Memory
 * (like `applySynthesisApproval`), then retires each source: status →
 * 'suppressed' (drops out of retrieval, stays inspectable) plus a
 * `(src)-[:SUPERSEDED_BY]->(new)` edge so the graph shows the
 * consolidation. Never hard-deletes. Sources that are no longer
 * 'active' at approval time (pinned/suppressed since the proposal was
 * filed) are left untouched — the DERIVED_FROM edge still records them.
 */
async function applyMergeApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  if (lookup.sourceMemoryIds.length < 2) {
    // A merge needs at least two sources — reject malformed proposals
    // rather than suppress a lone memory.
    await session.run(
      `MATCH (p:ProposedUpdate {id: $proposalId})
       SET p.status = 'rejected', p.resolvedAt = $now`,
      { proposalId, now },
    );
    return { status: "rejected", memoryId: lookup.memoryId, kind: "merge" };
  }

  const newMemoryId = crypto.randomUUID();
  const contentHash = computeContentHash(
    lookup.proposedTitle,
    lookup.proposedContent,
  );

  const result = await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = 'approved', p.resolvedAt = $now
     WITH p
     CREATE (m:Memory {
       id: $newMemoryId,
       userId: $userId,
       profileId: $profileId,
       title: $title,
       content: $content,
       type: 'knowledge',
       source: 'dream-mode',
       confidence: $confidence,
       status: 'active',
       createdAt: $now,
       updatedAt: $now,
       expiresAt: null,
       url: null,
       embedding: null,
       contentHash: $contentHash,
       sourceType: null,
       sourceId: null,
       storageId: null,
       mimeType: null,
       originalFilename: null,
       visitCount: 1,
       firstVisitAt: $now,
       lastVisitAt: $now
     })
     WITH m
     MERGE (s:Source {name: 'dream-mode'})
     CREATE (m)-[:FROM_SOURCE]->(s)
     WITH m
     UNWIND $sourceMemoryIds AS sid
     MATCH (src:Memory {id: sid, userId: $userId})
     MERGE (m)-[:DERIVED_FROM]->(src)
     WITH m, src
     WHERE src.status = 'active'
     SET src.status = 'suppressed', src.updatedAt = $now
     MERGE (src)-[:SUPERSEDED_BY]->(m)
     RETURN collect(src.id) AS supersededIds`,
    {
      proposalId,
      now,
      newMemoryId,
      userId: lookup.userId,
      profileId: lookup.sourceProfileId,
      title: lookup.proposedTitle,
      content: lookup.proposedContent,
      confidence: lookup.confidence,
      contentHash,
      sourceMemoryIds: lookup.sourceMemoryIds,
    },
  );

  await logEvent(
    session,
    newMemoryId,
    "created",
    "dream-mode",
    { kind: "merge", source: "synthesis-approve" },
    toSnapshot({
      title: lookup.proposedTitle,
      content: lookup.proposedContent,
      type: "knowledge",
      status: "active",
      confidence: lookup.confidence ?? 0,
      tags: [],
    }),
  );

  const supersededRaw: unknown = result.records[0]?.get("supersededIds");
  const supersededIds: string[] = Array.isArray(supersededRaw)
    ? supersededRaw.filter((x: unknown): x is string => typeof x === "string")
    : [];
  for (const sid of supersededIds) {
    await logEvent(
      session,
      sid,
      "superseded",
      "dream-mode",
      { by: newMemoryId, kind: "merge" },
      null,
    );
  }

  return {
    status: "approved",
    memoryId: newMemoryId,
    materializedMemoryId: newMemoryId,
    kind: "merge",
  };
}

/**
 * Contradiction resolution with a chosen winner: the winner's confidence
 * gets a small boost (the user just re-affirmed it), every other source
 * that is still 'active' is suppressed. Pinned losers are left alone —
 * pinning outranks a dream flag.
 */
async function applyContradictionResolution(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  winnerMemoryId: string,
  now: string,
): Promise<ResolveResult> {
  const loserIds = lookup.sourceMemoryIds.filter((id) => id !== winnerMemoryId);

  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = 'approved', p.resolvedAt = $now
     WITH p
     MATCH (w:Memory {id: $winnerId, userId: $userId})
     SET w.confidence = CASE
           WHEN coalesce(w.confidence, 0.5) + 0.1 > 1.0 THEN 1.0
           ELSE coalesce(w.confidence, 0.5) + 0.1
         END,
         w.updatedAt = $now`,
    { proposalId, winnerId: winnerMemoryId, userId: lookup.userId, now },
  );

  const suppressed = await session.run(
    `UNWIND $loserIds AS lid
     MATCH (l:Memory {id: lid, userId: $userId})
     WHERE l.status = 'active'
     SET l.status = 'suppressed', l.updatedAt = $now
     RETURN collect(l.id) AS suppressedIds`,
    { loserIds, userId: lookup.userId, now },
  );

  await logEvent(
    session,
    winnerMemoryId,
    "contradiction_resolved",
    "dream-mode",
    { outcome: "kept", proposalId },
    null,
  );
  const suppressedRaw: unknown = suppressed.records[0]?.get("suppressedIds");
  const suppressedIds: string[] = Array.isArray(suppressedRaw)
    ? suppressedRaw.filter((x: unknown): x is string => typeof x === "string")
    : [];
  for (const lid of suppressedIds) {
    await logEvent(
      session,
      lid,
      "contradiction_resolved",
      "dream-mode",
      { outcome: "suppressed", winner: winnerMemoryId, proposalId },
      null,
    );
  }

  return {
    status: "approved",
    memoryId: winnerMemoryId,
    kind: "contradiction",
  };
}

/**
 * Approve or reject a proposed update / delete / synthesis. Returns null
 * when the proposal id doesn't exist. Caller verifies ownership before
 * invoking.
 *
 * Legacy V2 fact-extraction kinds (UPDATE_FOR-bound):
 * - update + approve: copy `proposedContent` onto the existing memory.
 * - delete + approve: hard-delete the existing memory + its chunks.
 *
 * Dream Mode synthesis kinds (DERIVED_FROM-bound, no UPDATE_FOR):
 * - insight / connection + approve: materialise a new :Memory.
 * - merge + approve: materialise the consolidation + suppress sources
 *   with :SUPERSEDED_BY edges.
 * - contradiction + approve with `winnerMemoryId`: boost the winner,
 *   suppress the active losers. Without a winner: just marks resolved.
 * - anomaly + approve OR reject: just marks resolved.
 *
 * Reject (any kind): mark resolved, no graph mutation.
 */
export async function resolveProposal(
  driver: Driver,
  proposalId: string,
  action: "approve" | "reject",
  winnerMemoryId?: string,
): Promise<ResolveResult | null> {
  return withSession(driver, async (session) => {
    const now = new Date().toISOString();
    const lookup = await lookupProposalContext(session, proposalId);
    if (!lookup) return null;

    if (action === "reject") {
      return applyRejection(session, proposalId, lookup, now);
    }

    switch (lookup.kind) {
      case "delete":
        return applyDeleteApproval(session, proposalId, lookup, now);
      case "update":
        return applyUpdateApproval(session, proposalId, now);
      case "contradiction":
        // Winner must be one of the sources — anything else falls back
        // to the dismiss-only path rather than suppressing blindly.
        if (
          winnerMemoryId !== undefined &&
          lookup.sourceMemoryIds.includes(winnerMemoryId) &&
          lookup.sourceMemoryIds.length >= 2
        ) {
          return applyContradictionResolution(
            session,
            proposalId,
            lookup,
            winnerMemoryId,
            now,
          );
        }
        return applyDismissOnlyApproval(session, proposalId, lookup, now);
      case "anomaly":
        return applyDismissOnlyApproval(session, proposalId, lookup, now);
      case "insight":
      case "connection":
        return applySynthesisApproval(session, proposalId, lookup, now);
      case "merge":
        return applyMergeApproval(session, proposalId, lookup, now);
    }
  });
}

/**
 * Dedup check: returns true if a pending proposal already exists whose
 * sourceMemoryIds overlap by at least `overlapThreshold` (default 0.5)
 * with the candidate. Prevents the Dreamer from re-proposing the same
 * insight on consecutive runs.
 */
export async function hasOverlappingPendingProposal(
  driver: Driver,
  params: {
    userId: string;
    sourceMemoryIds: string[];
    overlapThreshold: number;
  },
): Promise<boolean> {
  if (params.sourceMemoryIds.length === 0) return false;
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (p:ProposedUpdate {status: 'pending'})
       WHERE p.source = 'dream-mode'
         AND p.sourceMemoryIds IS NOT NULL
         AND size(p.sourceMemoryIds) > 0
       WITH p,
            [x IN p.sourceMemoryIds WHERE x IN $candidateIds] AS overlap,
            p.sourceMemoryIds AS existing
       WITH p, size(overlap) AS overlapCount, size(existing) AS existingSize
       WHERE overlapCount > 0
         AND (toFloat(overlapCount) / toFloat(existingSize)) >= $threshold
       WITH p
       MATCH (m:Memory {userId: $userId})
       WHERE m.id IN p.sourceMemoryIds
       RETURN p.id AS id
       LIMIT 1`,
      {
        candidateIds: params.sourceMemoryIds,
        threshold: params.overlapThreshold,
        userId: params.userId,
      },
    );
    return result.records.length > 0;
  });
}

/**
 * Create a synthesis :ProposedUpdate (insight/connection/contradiction/anomaly).
 * Synthesis proposals carry their own title and a sourceMemoryIds list — they
 * are NOT bound via UPDATE_FOR to a single memory like update/delete proposals.
 * The proposals UI uses sourceMemoryIds + sourceMemorySnapshots to render the
 * "derived from" panel.
 */
export async function createSynthesisProposal(
  driver: Driver,
  params: {
    userId: string;
    kind: "insight" | "connection" | "contradiction" | "anomaly" | "merge";
    proposedTitle: string;
    proposedContent: string;
    reason: string;
    sourceMemoryIds: string[];
    confidence: number;
  },
): Promise<ProposedUpdateNode> {
  return withSession(driver, async (session) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // primaryMemoryId backfills the legacy `memoryId` field so existing
    // queries that look up "proposals affecting memory X" still surface
    // synthesis proposals where X is one of the sources. Picks the first
    // source by convention.
    const primaryMemoryId = params.sourceMemoryIds[0] ?? "";

    const result = await session.run(
      `CREATE (p:ProposedUpdate {
         id: $id,
         memoryId: $primaryMemoryId,
         proposedTitle: $proposedTitle,
         proposedContent: $proposedContent,
         reason: $reason,
         kind: $kind,
         status: 'pending',
         createdAt: $now,
         resolvedAt: null,
         sourceMemoryIds: $sourceMemoryIds,
         confidence: $confidence,
         source: 'dream-mode'
       })
       WITH p
       UNWIND $sourceMemoryIds AS sid
       MATCH (m:Memory {id: sid, userId: $userId})
       MERGE (p)-[:DERIVED_FROM]->(m)
       RETURN p`,
      {
        id,
        primaryMemoryId,
        proposedTitle: params.proposedTitle,
        proposedContent: params.proposedContent,
        reason: params.reason,
        kind: params.kind,
        now,
        sourceMemoryIds: params.sourceMemoryIds,
        confidence: params.confidence,
        userId: params.userId,
      },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) {
      throw new Error("Failed to create synthesis proposal");
    }

    return {
      id,
      memoryId: primaryMemoryId,
      proposedContent: params.proposedContent,
      proposedTitle: params.proposedTitle,
      reason: params.reason,
      kind: params.kind,
      status: "pending",
      createdAt: now,
      resolvedAt: null,
      sourceMemoryIds: params.sourceMemoryIds,
      confidence: params.confidence,
      source: "dream-mode",
      memorySnapshot: null,
      sourceMemorySnapshots: [],
    };
  });
}

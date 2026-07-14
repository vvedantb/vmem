import crypto from "node:crypto";
import type { Driver, Record as NeoRecord, Session } from "neo4j-driver";
import { z } from "zod";
import { neo4jGet, neo4jString, parseNeo4jNodeProps } from "../record";
import { computeContentHash, toMemoryWithTags, toSnapshot } from "./mappers";
import { logEvent, withSession } from "./shared";
import {
  PROPOSED_UPDATE_KINDS,
  type ProposedUpdateKind,
  type ProposedUpdateNode,
} from "./types";

const proposedUpdateStatusSchema = z.enum(["pending", "approved", "rejected"]);

const proposedUpdateNodePropsSchema = z.object({
  id: z.string(),
  memoryId: z.string().optional(),
  proposedContent: z.string().optional(),
  proposedTitle: z.string().nullable().optional(),
  reason: z.string().optional(),
  kind: z.string().optional(),
  status: proposedUpdateStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
  sourceMemoryIds: z.array(z.string()).optional(),
  confidence: z.number().nullable().optional(),
  source: z.string().optional(),
});

const sourceMemorySnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});

const sourceMemorySnapshotsSchema = z.array(sourceMemorySnapshotSchema);

type ProposedUpdateProps = z.infer<typeof proposedUpdateNodePropsSchema>;

const proposedUpdateKindSchema = z.enum(PROPOSED_UPDATE_KINDS).catch("update");

const proposalSourceSchema = z
  .enum(["v2-extraction", "dream-mode"])
  .catch("v2-extraction");

const stringArraySchema = z.array(z.string()).catch([]);

function toProposedUpdateNodeFromProps(
  props: ProposedUpdateProps,
  options: {
    memorySnapshot?: { title: string; content: string } | null;
    sourceMemorySnapshots?: { id: string; title: string; content: string }[];
  } = {},
): ProposedUpdateNode {
  return {
    id: props.id,
    memoryId: props.memoryId ?? "",
    proposedContent: props.proposedContent ?? "",
    proposedTitle: props.proposedTitle ?? null,
    reason: props.reason ?? "",
    kind: proposedUpdateKindSchema.parse(props.kind),
    status: props.status,
    createdAt: props.createdAt,
    resolvedAt: props.resolvedAt ?? null,
    sourceMemoryIds: stringArraySchema.parse(props.sourceMemoryIds),
    confidence: props.confidence ?? null,
    source: proposalSourceSchema.parse(props.source),
    memorySnapshot: options.memorySnapshot ?? null,
    sourceMemorySnapshots: options.sourceMemorySnapshots ?? [],
  };
}

function parseProposedUpdateNode(record: NeoRecord): ProposedUpdateNode {
  const props = parseNeo4jNodeProps(
    neo4jGet(record, "p"),
    proposedUpdateNodePropsSchema,
  );
  return toProposedUpdateNodeFromProps(props);
}

function parseListedProposedUpdate(record: NeoRecord): ProposedUpdateNode {
  const props = parseNeo4jNodeProps(
    neo4jGet(record, "p"),
    proposedUpdateNodePropsSchema,
  );

  const titleRaw = neo4jGet(record, "memoryTitle");
  const contentRaw = neo4jGet(record, "memoryContent");
  const memorySnapshot =
    typeof titleRaw === "string" && typeof contentRaw === "string"
      ? { title: titleRaw, content: contentRaw }
      : null;

  const sourceSnapsParsed = sourceMemorySnapshotsSchema.safeParse(
    neo4jGet(record, "sourceSnaps"),
  );
  const sourceMemorySnapshots = sourceSnapsParsed.success
    ? sourceSnapsParsed.data
    : [];

  return toProposedUpdateNodeFromProps(props, {
    memorySnapshot,
    sourceMemorySnapshots,
  });
}

async function createV2Proposal(
  driver: Driver,
  params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
    kind: "update" | "delete";
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
         kind: $kind,
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
        kind: params.kind,
        now,
      },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) {
      throw new Error(`Failed to create proposed ${params.kind}`);
    }
    return parseProposedUpdateNode(firstRecord);
  });
}

export async function createProposedUpdate(
  driver: Driver,
  params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
  },
): Promise<ProposedUpdateNode> {
  return createV2Proposal(driver, { ...params, kind: "update" });
}

export async function createProposedDelete(
  driver: Driver,
  params: { memoryId: string; reason: string },
): Promise<ProposedUpdateNode> {
  return createV2Proposal(driver, {
    memoryId: params.memoryId,
    proposedContent: "",
    reason: params.reason,
    kind: "delete",
  });
}

export async function listProposedUpdates(
  driver: Driver,
  userId: string,
): Promise<ProposedUpdateNode[]> {
  return withSession(driver, async (session) => {
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

    return result.records.map(parseListedProposedUpdate);
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

export interface ResolveResult {
  status: string;
  memoryId: string;
  kind: ProposedUpdateKind;
  /** Set when approve materialized a new memory (synthesis kinds). */
  materializedMemoryId?: string;
}

const proposalLookupRowSchema = z
  .object({
    kind: proposedUpdateKindSchema,
    proposedTitle: z.string().nullish().catch(null),
    proposedContent: z.string().nullish().catch(null),
    sourceMemoryIds: stringArraySchema,
    confidence: z.number().nullish().catch(null),
    targetId: z.string().nullish().catch(null),
    targetUserId: z.string().nullish().catch(null),
    sourceUserId: z.string().nullish().catch(null),
    sourceProfileId: z.string().nullish().catch(null),
  })
  .transform(
    (r): ProposalLookup => ({
      kind: r.kind,
      proposedTitle: r.proposedTitle || "Untitled synthesis",
      proposedContent: r.proposedContent ?? "",
      sourceMemoryIds: r.sourceMemoryIds,
      confidence: r.confidence ?? null,
      sourceProfileId: r.sourceProfileId ?? null,
      memoryId: r.targetId || r.sourceMemoryIds[0] || "",
      userId: r.targetUserId || r.sourceUserId || "",
    }),
  );

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

  const parsed = proposalLookupRowSchema.safeParse({
    kind: neo4jGet(lookupRecord, "kind"),
    proposedTitle: neo4jGet(lookupRecord, "proposedTitle"),
    proposedContent: neo4jGet(lookupRecord, "proposedContent"),
    sourceMemoryIds: neo4jGet(lookupRecord, "sourceMemoryIds"),
    confidence: neo4jGet(lookupRecord, "confidence"),
    targetId: neo4jGet(lookupRecord, "targetId"),
    targetUserId: neo4jGet(lookupRecord, "targetUserId"),
    sourceUserId: neo4jGet(lookupRecord, "sourceUserId"),
    sourceProfileId: neo4jGet(lookupRecord, "sourceProfileId"),
  });
  return parsed.success ? parsed.data : null;
}

async function applyStatusOnly(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
  status: "rejected" | "approved",
  eventName: "proposal_rejected" | "proposal_approved",
): Promise<ResolveResult> {
  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = $status, p.resolvedAt = $now`,
    { proposalId, now, status },
  );
  if (lookup.memoryId.length > 0) {
    await logEvent(
      session,
      lookup.memoryId,
      eventName,
      "api",
      { kind: lookup.kind },
      null,
    );
  }
  return { status, memoryId: lookup.memoryId, kind: lookup.kind };
}

async function applyRejection(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  return applyStatusOnly(
    session,
    proposalId,
    lookup,
    now,
    "rejected",
    "proposal_rejected",
  );
}

async function applyDeleteApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
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
    status: neo4jString(firstRecord, "status"),
    memoryId: memory.id,
    kind: "update",
  };
}

async function applyDismissOnlyApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  return applyStatusOnly(
    session,
    proposalId,
    lookup,
    now,
    "approved",
    "proposal_approved",
  );
}

const MATERIALISE_DERIVED_MEMORY_CYPHER = `
  MATCH (p:ProposedUpdate {id: $proposalId})
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
  MERGE (m)-[:DERIVED_FROM]->(src)`;

async function applySynthesisApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  if (lookup.sourceMemoryIds.length === 0) {
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

  await session.run(MATERIALISE_DERIVED_MEMORY_CYPHER, {
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
  });

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

async function applyMergeApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  if (lookup.sourceMemoryIds.length < 2) {
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
    `${MATERIALISE_DERIVED_MEMORY_CYPHER}
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

  const mergeRecord = result.records[0];
  const supersededIds = mergeRecord
    ? stringArraySchema.parse(neo4jGet(mergeRecord, "supersededIds"))
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
  const suppressedRecord = suppressed.records[0];
  const suppressedIds = suppressedRecord
    ? stringArraySchema.parse(neo4jGet(suppressedRecord, "suppressedIds"))
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

    return toProposedUpdateNodeFromProps({
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
    });
  });
}

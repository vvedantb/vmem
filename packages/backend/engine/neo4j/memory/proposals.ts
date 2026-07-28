import crypto from "node:crypto";
import type { Driver, Record as NeoRecord, Session } from "neo4j-driver";
import { z } from "zod";
import { neo4jGet, neo4jString, parseNeo4jNodeProps } from "../record";
import { computeContentHash, toMemoryWithTags, toSnapshot } from "./mappers";
import { withSession } from "../session";
import type { DreamScope, ScopeKind } from "./scope";
import { createDerivedMemoryCypher, logEvent, profileFilter } from "./shared";
import {
  PROPOSED_UPDATE_KINDS,
  type ProposedUpdateKind,
  type ProposedUpdateNode,
} from "./types";

const proposedUpdateStatusSchema = z.enum(["pending", "approved", "rejected"]);
const proposedUpdateKindSchema = z.enum(PROPOSED_UPDATE_KINDS).catch("update");
const proposalSourceSchema = z
  .enum(["v2-extraction", "dream-mode"])
  .catch("v2-extraction");
const stringArraySchema = z.array(z.string()).catch([]);

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

  return toProposedUpdateNodeFromProps(props, {
    memorySnapshot,
    sourceMemorySnapshots: sourceSnapsParsed.success
      ? sourceSnapsParsed.data
      : [],
  });
}

// teamProfileId / materializeUserId are set only for team-scoped synthesis
// proposals (see insertProposal's derived_from branch); passing null for
// personal/v2-extraction proposals leaves the properties unset on the node.
const PENDING_PROPOSAL_PROPS = `id: $id,
         memoryId: $memoryId,
         proposedContent: $proposedContent,
         proposedTitle: $proposedTitle,
         reason: $reason,
         kind: $kind,
         status: 'pending',
         createdAt: $now,
         resolvedAt: null,
         sourceMemoryIds: $sourceMemoryIds,
         confidence: $confidence,
         source: $source,
         teamProfileId: $teamProfileId,
         materializeUserId: $materializeUserId`;

interface InsertProposalFields {
  memoryId: string;
  proposedContent: string;
  proposedTitle: string | null;
  reason: string;
  kind: string;
  source: "v2-extraction" | "dream-mode";
  sourceMemoryIds: string[];
  confidence: number | null;
}

async function insertProposal(
  driver: Driver,
  fields: InsertProposalFields,
  link: { mode: "update_for" } | { mode: "derived_from"; scope: DreamScope },
  failMessage: string,
): Promise<ProposedUpdateNode> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let result;
  if (link.mode === "update_for") {
    result = await driver.executeQuery(
      `MATCH (m:Memory {id: $memoryId})
             CREATE (p:ProposedUpdate { ${PENDING_PROPOSAL_PROPS} })
             CREATE (p)-[:UPDATE_FOR]->(m)
             RETURN p`,
      { id, now, ...fields, teamProfileId: null, materializeUserId: null },
    );
  } else {
    const { scope } = link;
    const isTeam = scope.kind === "team";
    // Team synthesis reads across every member's memories, so the
    // derived_from source match keys on the shared profileId alone;
    // personal keeps the historical per-owner userId match.
    const sourceMatchProps = isTeam
      ? "profileId: $profileId"
      : "userId: $userId";
    result = await driver.executeQuery(
      `CREATE (p:ProposedUpdate { ${PENDING_PROPOSAL_PROPS} })
             WITH p
             UNWIND $sourceMemoryIds AS sid
             MATCH (m:Memory {id: sid, ${sourceMatchProps}})
             MERGE (p)-[:DERIVED_FROM]->(m)
             RETURN p`,
      {
        id,
        now,
        ...fields,
        userId: scope.userId,
        profileId: scope.profileId,
        teamProfileId: isTeam ? scope.profileId : null,
        materializeUserId: isTeam ? scope.userId : null,
      },
    );
  }

  const firstRecord = result.records[0];
  if (!firstRecord) throw new Error(failMessage);
  return parseProposedUpdateNode(firstRecord);
}

function insertV2Proposal(
  driver: Driver,
  params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
    kind: "update" | "delete";
  },
): Promise<ProposedUpdateNode> {
  return insertProposal(
    driver,
    {
      memoryId: params.memoryId,
      proposedContent: params.proposedContent,
      proposedTitle: null,
      reason: params.reason,
      kind: params.kind,
      source: "v2-extraction",
      sourceMemoryIds: [],
      confidence: null,
    },
    { mode: "update_for" },
    `Failed to create proposed ${params.kind}`,
  );
}

export async function createProposedUpdate(
  driver: Driver,
  params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
  },
): Promise<ProposedUpdateNode> {
  return insertV2Proposal(driver, { ...params, kind: "update" });
}

export async function createProposedDelete(
  driver: Driver,
  params: { memoryId: string; reason: string },
): Promise<ProposedUpdateNode> {
  return insertV2Proposal(driver, {
    memoryId: params.memoryId,
    proposedContent: "",
    reason: params.reason,
    kind: "delete",
  });
}

export async function listProposedUpdates(
  driver: Driver,
  userId: string,
  options?: { profileId?: string | null; strictProfile?: boolean },
): Promise<ProposedUpdateNode[]> {
  const isTeamProfile = options?.strictProfile === true;
  const pf = profileFilter(options?.profileId, "m", {
    strict: options?.strictProfile === true,
  });
  const pfSrc = profileFilter(options?.profileId, "src", {
    strict: options?.strictProfile === true,
  });
  // Team profile inboxes are shared: every member should see every proposal
  // whose sources live in the profile, not only proposals touching memories
  // they personally created, so the source match drops the userId constraint.
  const srcMatch = isTeamProfile
    ? "MATCH (src:Memory)"
    : "MATCH (src:Memory {userId: $userId})";

  const result = await driver.executeQuery(
    `MATCH (p:ProposedUpdate {status: 'pending'})
       OPTIONAL MATCH (p)-[:UPDATE_FOR]->(m:Memory)
       WITH p, m
       OPTIONAL ${srcMatch}
         WHERE src.id IN coalesce(p.sourceMemoryIds, [])
         ${pfSrc.clause}
       WITH p, m,
            collect(DISTINCT { id: src.id, title: src.title, content: src.content }) AS sources
       WHERE (m IS NOT NULL AND m.userId = $userId ${pf.clause})
          OR (m IS NULL AND size([s IN sources WHERE s.id IS NOT NULL]) > 0)
       RETURN p,
              m.title AS memoryTitle,
              m.content AS memoryContent,
              [s IN sources WHERE s.id IS NOT NULL] AS sourceSnaps
       ORDER BY p.createdAt DESC`,
    { userId, ...pf.params },
  );

  return result.records.map(parseListedProposedUpdate);
}

interface ProposalLookup {
  kind: ProposedUpdateKind;
  proposedTitle: string;
  proposedContent: string;
  sourceMemoryIds: string[];
  confidence: number | null;
  // profileId to use when materialising the derived memory — the shared
  // team profileId for team proposals, else the first source's profileId.
  sourceProfileId: string | null;
  memoryId: string;
  userId: string;
  // which derived-memory Cypher (shared.ts createDerivedMemoryCypher) to run
  scopeKind: ScopeKind;
}

export interface ResolveResult {
  status: string;
  memoryId: string;
  kind: ProposedUpdateKind;
  materializedMemoryId?: string;
}

export const proposalLookupRowSchema = z
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
    teamProfileId: z.string().nullish().catch(null),
    materializeUserId: z.string().nullish().catch(null),
  })
  .transform((r): ProposalLookup => {
    const isTeam = typeof r.teamProfileId === "string";
    return {
      kind: r.kind,
      proposedTitle: r.proposedTitle || "Untitled synthesis",
      proposedContent: r.proposedContent ?? "",
      sourceMemoryIds: r.sourceMemoryIds,
      confidence: r.confidence ?? null,
      sourceProfileId:
        typeof r.teamProfileId === "string"
          ? r.teamProfileId
          : (r.sourceProfileId ?? null),
      memoryId: r.targetId || r.sourceMemoryIds[0] || "",
      userId: isTeam
        ? (r.materializeUserId ?? "")
        : r.targetUserId || r.sourceUserId || "",
      scopeKind: isTeam ? "team" : "personal",
    };
  });

function parseProposalLookupRecord(record: NeoRecord): ProposalLookup | null {
  const parsed = proposalLookupRowSchema.safeParse({
    kind: neo4jGet(record, "kind"),
    proposedTitle: neo4jGet(record, "proposedTitle"),
    proposedContent: neo4jGet(record, "proposedContent"),
    sourceMemoryIds: neo4jGet(record, "sourceMemoryIds"),
    confidence: neo4jGet(record, "confidence"),
    targetId: neo4jGet(record, "targetId"),
    targetUserId: neo4jGet(record, "targetUserId"),
    sourceUserId: neo4jGet(record, "sourceUserId"),
    sourceProfileId: neo4jGet(record, "sourceProfileId"),
    teamProfileId: neo4jGet(record, "teamProfileId"),
    materializeUserId: neo4jGet(record, "materializeUserId"),
  });
  return parsed.success ? parsed.data : null;
}

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
       firstSource.profileId AS sourceProfileId,
       p.teamProfileId AS teamProfileId,
       p.materializeUserId AS materializeUserId`,
    { proposalId },
  );

  const lookupRecord = lookup.records[0];
  if (!lookupRecord) return null;
  return parseProposalLookupRecord(lookupRecord);
}

async function setProposalStatus(
  session: Session,
  proposalId: string,
  status: "rejected" | "approved",
  now: string,
): Promise<void> {
  await session.run(
    `MATCH (p:ProposedUpdate {id: $proposalId})
     SET p.status = $status, p.resolvedAt = $now`,
    { proposalId, now, status },
  );
}

async function applyStatusOnly(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
  status: "rejected" | "approved",
  eventName: "proposal_rejected" | "proposal_approved",
): Promise<ResolveResult> {
  await setProposalStatus(session, proposalId, status, now);
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

function materialiseDerivedMemoryCypher(kind: ScopeKind): string {
  return `
  MATCH (p:ProposedUpdate {id: $proposalId})
  SET p.status = 'approved', p.resolvedAt = $now
  WITH p
  ${createDerivedMemoryCypher(kind)}`;
}

async function rejectUnresolved(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
): Promise<ResolveResult> {
  await setProposalStatus(session, proposalId, "rejected", now);
  return { status: "rejected", memoryId: lookup.memoryId, kind: lookup.kind };
}

async function applyDerivedMemoryApproval(
  session: Session,
  proposalId: string,
  lookup: ProposalLookup,
  now: string,
  options: { minSources: number; supersedeSources: boolean },
): Promise<ResolveResult> {
  if (lookup.sourceMemoryIds.length < options.minSources) {
    return rejectUnresolved(session, proposalId, lookup, now);
  }

  const newMemoryId = crypto.randomUUID();
  const contentHash = computeContentHash(
    lookup.proposedTitle,
    lookup.proposedContent,
  );
  const materialiseParams = {
    proposalId,
    now,
    id: newMemoryId,
    userId: lookup.userId,
    profileId: lookup.sourceProfileId,
    title: lookup.proposedTitle,
    content: lookup.proposedContent,
    confidence: lookup.confidence,
    embedding: null,
    contentHash,
    sourceMemoryIds: lookup.sourceMemoryIds,
  };

  const materialiseCypher = materialiseDerivedMemoryCypher(lookup.scopeKind);
  const result = options.supersedeSources
    ? await session.run(
        `${materialiseCypher}
         WITH m, src
         WHERE src.status = 'active'
         SET src.status = 'suppressed', src.updatedAt = $now
         MERGE (src)-[:SUPERSEDED_BY]->(m)
         RETURN collect(src.id) AS supersededIds`,
        materialiseParams,
      )
    : await session.run(materialiseCypher, materialiseParams);

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

  if (options.supersedeSources) {
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
  }

  return {
    status: "approved",
    memoryId: newMemoryId,
    materializedMemoryId: newMemoryId,
    kind: lookup.kind,
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

// AI-generated (Claude), prompt: "resolve proposed updates with kind specific approve reject paths including contradiction winner selection"
// Modified by me: event snapshots and pending overlap guards for dream proposals
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
      return applyStatusOnly(
        session,
        proposalId,
        lookup,
        now,
        "rejected",
        "proposal_rejected",
      );
    }

    const dismissOnly = () =>
      applyStatusOnly(
        session,
        proposalId,
        lookup,
        now,
        "approved",
        "proposal_approved",
      );

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
        return dismissOnly();
      case "anomaly":
        return dismissOnly();
      case "insight":
      case "connection":
        return applyDerivedMemoryApproval(session, proposalId, lookup, now, {
          minSources: 1,
          supersedeSources: false,
        });
      case "merge":
        return applyDerivedMemoryApproval(session, proposalId, lookup, now, {
          minSources: 2,
          supersedeSources: true,
        });
    }
  });
}

export async function hasOverlappingPendingProposal(
  driver: Driver,
  params: {
    scope: DreamScope;
    sourceMemoryIds: string[];
    overlapThreshold: number;
  },
): Promise<boolean> {
  if (params.sourceMemoryIds.length === 0) return false;
  const ownerMatch =
    params.scope.kind === "team" ? "profileId: $profileId" : "userId: $userId";
  const result = await driver.executeQuery(
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
       MATCH (m:Memory {${ownerMatch}})
       WHERE m.id IN p.sourceMemoryIds
       RETURN p.id AS id
       LIMIT 1`,
    {
      candidateIds: params.sourceMemoryIds,
      threshold: params.overlapThreshold,
      userId: params.scope.userId,
      profileId: params.scope.profileId,
    },
  );
  return result.records.length > 0;
}

export async function createSynthesisProposal(
  driver: Driver,
  params: {
    scope: DreamScope;
    kind: "insight" | "connection" | "contradiction" | "anomaly" | "merge";
    proposedTitle: string;
    proposedContent: string;
    reason: string;
    sourceMemoryIds: string[];
    confidence: number;
  },
): Promise<ProposedUpdateNode> {
  return insertProposal(
    driver,
    {
      memoryId: params.sourceMemoryIds[0] ?? "",
      proposedContent: params.proposedContent,
      proposedTitle: params.proposedTitle,
      reason: params.reason,
      kind: params.kind,
      source: "dream-mode",
      sourceMemoryIds: params.sourceMemoryIds,
      confidence: params.confidence,
    },
    { mode: "derived_from", scope: params.scope },
    "Failed to create synthesis proposal",
  );
}

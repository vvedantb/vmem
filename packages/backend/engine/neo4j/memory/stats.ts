/**
 * Dashboard analytics: stats summary + recent activity feed.
 * Both are user-wide reads with optional profile filter (per project rule:
 * profiles narrow saves, not high-level totals — but optional scoping is
 * still supported for views that ask for it).
 */

import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";
import { neo4jGet, parseNeo4jInt, parseNeo4jNodeProps } from "../record";
import { profileFilter, withSession } from "./shared";

const activityEventPropsSchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.string().optional(),
  createdAt: z.string(),
});

export async function getStats(
  driver: Driver,
  userId: string,
  profileId?: string | null,
): Promise<{
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  totalTags: number;
  growthData: { date: string; total: number; new: number }[];
}> {
  return withSession(driver, async (session) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    // Two profileFilter() calls so the alias is correct on each side of the
    // OPTIONAL MATCH — replaces the prior `pf.clause.replace(/m\./g, "m2.")`
    // string-mangling hack.
    const pfM = profileFilter(profileId, "m");
    const pfM2 = profileFilter(profileId, "m2");

    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE true ${pfM.clause}
       WITH count(m) AS total,
            count(CASE WHEN m.createdAt >= $weekAgo THEN 1 END) AS thisWeek,
            count(CASE WHEN m.createdAt >= $monthAgo THEN 1 END) AS thisMonth,
            count(CASE WHEN m.createdAt >= $todayStart THEN 1 END) AS today
       OPTIONAL MATCH (t:Tag)<-[:TAGGED_WITH]-(m2:Memory {userId: $userId})
       WHERE true ${pfM2.clause}
       WITH total, thisWeek, thisMonth, today, count(DISTINCT t) AS tagCount
       RETURN total, thisWeek, thisMonth, today, tagCount`,
      {
        userId,
        ...pfM.params,
        weekAgo: weekAgo.toISOString(),
        monthAgo: monthAgo.toISOString(),
        todayStart,
      },
    );

    let totalMemories = 0;
    let memoriesThisWeek = 0;
    let memoriesThisMonth = 0;
    let memoriesAddedToday = 0;
    let totalTags = 0;

    const record = result.records[0];
    if (record) {
      totalMemories = parseNeo4jInt(neo4jGet(record, "total"));
      memoriesThisWeek = parseNeo4jInt(neo4jGet(record, "thisWeek"));
      memoriesThisMonth = parseNeo4jInt(neo4jGet(record, "thisMonth"));
      memoriesAddedToday = parseNeo4jInt(neo4jGet(record, "today"));
      totalTags = parseNeo4jInt(neo4jGet(record, "tagCount"));
    }

    // Growth data: old implementation ran OPTIONAL MATCH twice per day in a
    // 7-day UNWIND, doing O(7×n) scans to recompute the cumulative total for
    // each day. Historical per-day totals never change, so replace with:
    //   1. A single baseline count of memories created before the window.
    //   2. A single bucketed aggregate of daily counts within the window.
    // Cumulative totals are then computed in JS by walking the 7 days in
    // order, adding each daily delta onto the running baseline.
    const baselineResult = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE date(datetime(m.createdAt)) < date() - duration({days: 6}) ${pfM.clause}
       RETURN count(m) AS baseline`,
      { userId, ...pfM.params },
    );
    const baselineRecord = baselineResult.records[0];
    const baseline = baselineRecord
      ? parseNeo4jInt(neo4jGet(baselineRecord, "baseline"))
      : 0;

    const dailyResult = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE date(datetime(m.createdAt)) >= date() - duration({days: 6})
         AND date(datetime(m.createdAt)) <= date() ${pfM.clause}
       RETURN toString(date(datetime(m.createdAt))) AS day, count(*) AS newCount`,
      { userId, ...pfM.params },
    );

    const dailyCounts = new Map<string, number>();
    for (const rec of dailyResult.records) {
      dailyCounts.set(
        String(neo4jGet(rec, "day") ?? ""),
        parseNeo4jInt(neo4jGet(rec, "newCount")),
      );
    }

    // Walk the 7-day window in ascending order, accumulating the running
    // total. `todayMs` anchors to midnight local-day so we can derive the
    // ISO yyyy-mm-dd key matching Cypher's `date()` output.
    const today = new Date();
    const todayMs = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    let running = baseline;
    const growthData: { date: string; total: number; new: number }[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const dayDate = new Date(todayMs - offset * dayMs);
      const isoDay = dayDate.toISOString().slice(0, 10);
      const newCount = dailyCounts.get(isoDay) ?? 0;
      running += newCount;
      growthData.push({
        date: dayDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        total: running,
        new: newCount,
      });
    }

    return {
      totalMemories,
      memoriesThisWeek,
      memoriesThisMonth,
      memoriesAddedToday,
      totalTags,
      growthData,
    };
  });
}

/**
 * Diagnostic: count MemoryEvent nodes for a user, plus a per-action
 * breakdown. Backs the `debugCountEvents` dashboard action — kept in the
 * read service so no action opens a raw driver session of its own.
 */
export async function countMemoryEvents(
  driver: Driver,
  userId: string,
): Promise<{ total: number; breakdown: { action: string; count: number }[] }> {
  return withSession(driver, async (session) => {
    const totalResult = await session.run(
      `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
       RETURN count(e) AS total`,
      { userId },
    );
    const totalRecord = totalResult.records[0];
    const total = totalRecord
      ? parseNeo4jInt(neo4jGet(totalRecord, "total"))
      : 0;

    const breakdownResult = await session.run(
      `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
       RETURN e.action AS action, count(*) AS cnt
       ORDER BY cnt DESC`,
      { userId },
    );
    const breakdown = breakdownResult.records.map((r) => ({
      action: String(neo4jGet(r, "action") ?? ""),
      count: parseNeo4jInt(neo4jGet(r, "cnt")),
    }));

    return { total, breakdown };
  });
}

export async function getRecentActivity(
  driver: Driver,
  userId: string,
  profileId?: string | null,
  limit = 10,
): Promise<
  {
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    relativeTime: string;
  }[]
> {
  return withSession(driver, async (session) => {
    const pf = profileFilter(profileId, "m");

    const result = await session.run(
      `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
       WHERE true ${pf.clause}
       RETURN e, m.title AS memoryTitle
       ORDER BY e.createdAt DESC
       LIMIT $limit`,
      { userId, ...pf.params, limit: neo4j.int(limit) },
    );

    const now = Date.now();
    return result.records.map((record) => {
      const props = parseNeo4jNodeProps(
        neo4jGet(record, "e"),
        activityEventPropsSchema,
      );
      const memoryTitle = String(neo4jGet(record, "memoryTitle") ?? "");
      const action = props.action;
      const actor = String(props.actor ?? "");
      const createdAt = props.createdAt;
      const diffMs = now - new Date(createdAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let relativeTime: string;
      if (diffMins < 1) relativeTime = "just now";
      else if (diffMins < 60) relativeTime = `${diffMins}m ago`;
      else if (diffHours < 24) relativeTime = `${diffHours}h ago`;
      else relativeTime = `${diffDays}d ago`;

      // Dream Mode-materialized memories use actor='dream-mode' on the
      // logEvent call. We promote those into a distinct activity type so
      // the feed can filter / icon them separately from manual creates.
      const isDreamMode = actor === "dream-mode";

      const activityMeta: Record<
        string,
        { type: string; description: string }
      > = {
        created: isDreamMode
          ? {
              type: "memory_dream_created",
              description: `Dream Mode synthesized "${memoryTitle}"`,
            }
          : { type: "memory_created", description: `Created "${memoryTitle}"` },
        updated: {
          type: "memory_updated",
          description: `Updated "${memoryTitle}"`,
        },
        deleted: {
          type: "memory_deleted",
          description: `Deleted "${memoryTitle}"`,
        },
      };
      const meta = activityMeta[action];

      return {
        id: props.id,
        type: meta?.type ?? action,
        title: "Memory",
        description: meta?.description ?? `${action} "${memoryTitle}"`,
        timestamp: createdAt,
        relativeTime,
      };
    });
  });
}

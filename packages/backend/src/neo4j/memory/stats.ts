/**
 * Dashboard analytics: stats summary + recent activity feed.
 * Both are user-wide reads with optional profile filter (per project rule:
 * profiles narrow saves, not high-level totals — but optional scoping is
 * still supported for views that ask for it).
 */

import neo4j, { type Driver } from "neo4j-driver";
import { toNeoInt } from "./mappers";
import { profileFilter, withSession } from "./shared";

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

    if (result.records.length > 0) {
      const record = result.records[0];
      if (record) {
        totalMemories = toNeoInt(record.get("total"));
        memoriesThisWeek = toNeoInt(record.get("thisWeek"));
        memoriesThisMonth = toNeoInt(record.get("thisMonth"));
        memoriesAddedToday = toNeoInt(record.get("today"));
        totalTags = toNeoInt(record.get("tagCount"));
      }
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
      ? toNeoInt(baselineRecord.get("baseline"))
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
      dailyCounts.set(String(rec.get("day")), toNeoInt(rec.get("newCount")));
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
      const props = record.get("e").properties;
      const memoryTitle = String(
        props.memoryTitle ?? record.get("memoryTitle"),
      );
      const action = String(props.action);
      const actor = String(props.actor ?? "");
      const createdAt = String(props.createdAt);
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

      const typeMap: Record<string, string> = {
        created: isDreamMode ? "memory_dream_created" : "memory_created",
        updated: "memory_updated",
        deleted: "memory_deleted",
      };

      const descMap: Record<string, string> = {
        created: isDreamMode
          ? `Dream Mode synthesized "${memoryTitle}"`
          : `Created "${memoryTitle}"`,
        updated: `Updated "${memoryTitle}"`,
        deleted: `Deleted "${memoryTitle}"`,
      };

      return {
        id: String(props.id),
        type: typeMap[action] ?? action,
        title: "Memory",
        description: descMap[action] ?? `${action} "${memoryTitle}"`,
        timestamp: createdAt,
        relativeTime,
      };
    });
  });
}

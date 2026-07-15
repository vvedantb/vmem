import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";
import {
  neo4jGet,
  firstNeo4jInt,
  neo4jInt,
  neo4jString,
  parseNeo4jNodeProps,
} from "../record";
import { withSession } from "../session";
import { profileFilter } from "./shared";

const activityEventPropsSchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.string().optional(),
  createdAt: z.string(),
});

function formatRelativeTime(diffMs: number): string {
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function activityMetaFor(
  action: string,
  memoryTitle: string,
  actor: string,
): { type: string; description: string } {
  if (action === "created") {
    if (actor === "dream-mode") {
      return {
        type: "memory_dream_created",
        description: `Dream Mode synthesized "${memoryTitle}"`,
      };
    }
    return {
      type: "memory_created",
      description: `Created "${memoryTitle}"`,
    };
  }
  if (action === "updated") {
    return {
      type: "memory_updated",
      description: `Updated "${memoryTitle}"`,
    };
  }
  if (action === "deleted") {
    return {
      type: "memory_deleted",
      description: `Deleted "${memoryTitle}"`,
    };
  }
  return { type: action, description: `${action} "${memoryTitle}"` };
}

export async function getStats(
  driver: Driver,
  userId: string,
  profileId?: string | null,
  strictProfile: boolean = false,
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

    const pfM = profileFilter(profileId, "m", { strict: strictProfile });
    const pfM2 = profileFilter(profileId, "m2", { strict: strictProfile });

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

    const totalMemories = firstNeo4jInt(result, "total");
    const memoriesThisWeek = firstNeo4jInt(result, "thisWeek");
    const memoriesThisMonth = firstNeo4jInt(result, "thisMonth");
    const memoriesAddedToday = firstNeo4jInt(result, "today");
    const totalTags = firstNeo4jInt(result, "tagCount");

    const baselineResult = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE date(datetime(m.createdAt)) < date() - duration({days: 6}) ${pfM.clause}
       RETURN count(m) AS baseline`,
      { userId, ...pfM.params },
    );
    const baseline = firstNeo4jInt(baselineResult, "baseline");

    const dailyResult = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE date(datetime(m.createdAt)) >= date() - duration({days: 6})
         AND date(datetime(m.createdAt)) <= date() ${pfM.clause}
       RETURN toString(date(datetime(m.createdAt))) AS day, count(*) AS newCount`,
      { userId, ...pfM.params },
    );

    const dailyCounts = new Map<string, number>();
    for (const rec of dailyResult.records) {
      dailyCounts.set(neo4jString(rec, "day"), neo4jInt(rec, "newCount"));
    }

    let running = baseline;
    const growthData: { date: string; total: number; new: number }[] = [];
    const today = new Date();
    const todayMs = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
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
  strictProfile: boolean = false,
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
  const pf = profileFilter(profileId, "m", { strict: strictProfile });

  const result = await driver.executeQuery(
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
    const memoryTitle = neo4jString(record, "memoryTitle");
    const meta = activityMetaFor(props.action, memoryTitle, props.actor ?? "");

    return {
      id: props.id,
      type: meta.type,
      title: "Memory",
      description: meta.description,
      timestamp: props.createdAt,
      relativeTime: formatRelativeTime(
        now - new Date(props.createdAt).getTime(),
      ),
    };
  });
}

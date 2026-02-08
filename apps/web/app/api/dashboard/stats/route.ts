import { NextResponse } from "next/server";
import { memories } from "@/app/api/memories/store";

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Calculate stats from actual memory data
  const totalMemories = memories.length;

  const memoriesThisWeek = memories.filter(
    (m) => new Date(m.createdAt) >= oneWeekAgo
  ).length;

  const memoriesThisMonth = memories.filter(
    (m) => new Date(m.createdAt) >= oneMonthAgo
  ).length;

  // Count unique tags
  const uniqueTags = new Set<string>();
  memories.forEach((m) => m.tags.forEach((tag) => uniqueTags.add(tag)));
  const totalTags = uniqueTags.size;

  // Calculate memory growth data (last 7 days)
  const growthData: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const count = memories.filter((m) => {
      const createdAt = new Date(m.createdAt);
      return createdAt >= date && createdAt < nextDate;
    }).length;

    growthData.push({
      date: date.toLocaleDateString("en-US", { weekday: "short" }),
      count,
    });
  }

  // Calculate cumulative growth for the chart
  let cumulative = totalMemories - memoriesThisWeek;
  const cumulativeGrowth = growthData.map((day) => {
    cumulative += day.count;
    return {
      date: day.date,
      total: cumulative,
      new: day.count,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      totalMemories,
      memoriesThisWeek,
      memoriesThisMonth,
      totalTags,
      growthData: cumulativeGrowth,
    },
  });
}

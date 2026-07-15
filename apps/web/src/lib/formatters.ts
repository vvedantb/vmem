import { formatRelativeTime as formatSharedRelativeTime } from "@vmem/shared";

export function formatRelativeTime(
  dateInput: string | number | null | undefined,
): string {
  return formatSharedRelativeTime(dateInput);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

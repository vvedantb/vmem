export { formatDate, formatDateTime } from "@vmem/shared";

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

export { formatDate, formatDurationMs as formatDuration } from "@vmem/shared";

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

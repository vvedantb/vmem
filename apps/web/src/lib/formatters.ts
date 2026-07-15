export function formatDate(dateInput: string | number): string {
  return new Date(dateInput).toLocaleDateString("en-US", {
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

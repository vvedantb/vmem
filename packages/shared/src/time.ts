import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function formatDate(dateInput: string | number): string {
  const date = dayjs(dateInput);
  if (!date.isValid()) {
    return typeof dateInput === "string" ? dateInput : "";
  }
  return date.format("MMM D, YYYY");
}

export function formatDateTime(dateInput: string | number): string {
  const date = dayjs(dateInput);
  if (!date.isValid()) {
    return typeof dateInput === "string" ? dateInput : "";
  }
  return date.format("MMM D, YYYY, h:mm A");
}

export function formatRelativeTime(
  dateInput: string | number | null | undefined,
  options: { empty?: string } = {},
): string {
  if (dateInput === null || dateInput === undefined || dateInput === 0) {
    return options.empty ?? "Never";
  }
  return dayjs(dateInput).fromNow();
}

export function formatTimeUntil(
  scheduledTime: number,
  options: { due?: string } = {},
): string {
  if (scheduledTime <= Date.now()) return options.due ?? "any moment";
  return dayjs(scheduledTime).fromNow();
}

// short month + day in the viewer's locale ("24 Jul" in en-GB, "Jul 24" in
// en-US). Takes an ISO day ("YYYY-MM-DD"), parsed as UTC so a date-only string
// never shifts a day in timezones behind UTC.
export function formatMonthDay(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// Intl compact notation (1.2k / 3m); lowercased to match existing UI
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(num)
    .toLowerCase();
}

export function formatDurationMs(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

// same calendar day → time only; otherwise short date + time
export function formatSameDayOrDateTime(ts: number): string {
  const date = dayjs(ts);
  if (!date.isValid()) return "";
  if (date.isSame(dayjs(), "day")) {
    return date.format("h:mm:ss A");
  }
  return date.format("MMM D h:mm A");
}

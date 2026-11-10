import { structuredStoreBodySchema, type StructuredStoreBody } from "@vmem/sdk";
import type { RawEvent } from "../modules/vmem-tracker/src/api";

export const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const INSTALL = "install-1";

let nextId = 1;

export const byNumber = (a: number, b: number): number => a - b;

export function usage(
  startMin: number,
  endMin: number,
  pkg = "com.android.chrome",
  label = "Chrome",
): RawEvent {
  return {
    id: nextId++,
    kind: "app_usage",
    package: pkg,
    label,
    startMs: T0 + startMin * MIN,
    endMs: T0 + endMin * MIN,
    text: null,
    subject: null,
  };
}

export function share(
  text: string,
  options: { subject?: string; label?: string; atMin?: number } = {},
): RawEvent {
  const at = T0 + (options.atMin ?? 0) * MIN;
  return {
    id: nextId++,
    kind: "share",
    package: options.label ? "com.android.chrome" : null,
    label: options.label ?? null,
    startMs: at,
    endMs: at,
    text,
    subject: options.subject ?? null,
  };
}

/** Parses an item body with the SDK contract, so tests also check the wire shape. */
export function bodyOf(item: { body: string }): StructuredStoreBody {
  return structuredStoreBodySchema.parse(JSON.parse(item.body));
}

export function textEvent(
  kind: "note" | "clipboard",
  text: string,
  atMin = 0,
): RawEvent {
  const at = T0 + atMin * MIN;
  return {
    id: nextId++,
    kind,
    package: null,
    label: null,
    startMs: at,
    endMs: at,
    text,
    subject: null,
  };
}

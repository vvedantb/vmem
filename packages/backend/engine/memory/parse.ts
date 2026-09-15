import {
  memoryStatusSchema,
  memoryTypeSchema,
  type MemoryStatus,
  type MemoryType,
} from "@vmem/sdk";

export function toMemoryTypeOrUndefined(
  val: string | null | undefined,
): MemoryType | undefined {
  if (val === null || val === undefined) return undefined;
  const parsed = memoryTypeSchema.safeParse(val);
  return parsed.success ? parsed.data : undefined;
}

export function toMemoryStatusOrUndefined(
  val: string | null | undefined,
): MemoryStatus | undefined {
  if (val === null || val === undefined) return undefined;
  const parsed = memoryStatusSchema.safeParse(val);
  return parsed.success ? parsed.data : undefined;
}

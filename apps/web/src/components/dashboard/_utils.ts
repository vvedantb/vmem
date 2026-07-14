import {
  IconBrain,
  IconCheck,
  IconKey,
  IconPlugConnected,
  IconUpload,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

export function getActivityIcon(type: string): TablerIcon {
  switch (type) {
    case "memory_created":
    case "memory_updated":
      return IconBrain;
    case "file_uploaded":
      return IconUpload;
    case "sync_completed":
      return IconPlugConnected;
    case "api_key_created":
      return IconKey;
    default:
      return IconCheck;
  }
}

// pull the memory title out of descriptions like `Created "My title"`
export function getActivityLabel(description: string): string {
  const quoted = /"([^"]+)"/.exec(description);
  const title = quoted?.at(1);
  if (title !== undefined) return title;
  return description;
}

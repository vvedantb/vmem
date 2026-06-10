import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconX,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import {
  getToolOrDynamicToolName,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

export type ToolPart = ToolUIPart | DynamicToolUIPart;

function mapTaskStatus(part: ToolPart): "running" | "completed" | "failed" {
  if (part.state === "output-available") return "completed";
  if (part.state === "output-error") return "failed";
  return "running";
}

function formatPayload(payload: ToolPart["input"]): string {
  if (payload === undefined) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function PayloadBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View className="mt-2">
      <Text className="mb-1 text-[10px] font-sans-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
      <View className="rounded-lg bg-surface-secondary p-3">
        <Text
          className="text-xs text-foreground"
          style={{ fontFamily: "monospace" }}
          numberOfLines={20}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Tool-call status + expandable input/output — port of web's Task + Tool blocks. */
export default function ToolCallBlock({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const name = getToolOrDynamicToolName(part);
  const status = mapTaskStatus(part);
  const StatusIcon =
    status === "completed"
      ? IconCheck
      : status === "failed"
        ? IconX
        : IconLoader2;
  const statusColor =
    status === "completed"
      ? theme.success
      : status === "failed"
        ? theme.destructive
        : theme.muted;

  const input = "input" in part ? formatPayload(part.input) : "";
  const output =
    part.state === "output-available"
      ? formatPayload(part.output)
      : part.state === "output-error"
        ? part.errorText
        : "";

  return (
    <View className="mb-2 w-full">
      <Pressable
        onPress={() => setExpanded((cur) => !cur)}
        className="flex-row items-center gap-2 rounded-lg bg-surface-secondary/40 px-3 py-2"
      >
        <StatusIcon size={14} color={statusColor} />
        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
          Tool: {name}
        </Text>
        {expanded ? (
          <IconChevronDown size={14} color={theme.muted} />
        ) : (
          <IconChevronRight size={14} color={theme.muted} />
        )}
      </Pressable>
      {expanded && (
        <View className="px-1">
          <PayloadBlock label="Input" value={input} />
          <PayloadBlock label="Output" value={output} />
        </View>
      )}
    </View>
  );
}

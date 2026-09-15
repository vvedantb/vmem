import { useState } from "react";
import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

export interface SourceUrlPart {
  sourceId: string;
  url: string;
  title?: string;
}

function openSource(url: string) {
  void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** Collapsible "N sources" list — port of web's Sources block. */
export function SourcesBlock({ sources }: { sources: SourceUrlPart[] }) {
  const [expanded, setExpanded] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="mb-2 w-full">
      <Pressable
        onPress={() => setExpanded((cur) => !cur)}
        className="flex-row items-center gap-1 py-1"
      >
        {expanded ? (
          <IconChevronDown size={14} color={theme.muted} />
        ) : (
          <IconChevronRight size={14} color={theme.muted} />
        )}
        <Text className="text-sm text-muted-foreground">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </Text>
      </Pressable>
      {expanded && (
        <View className="gap-2">
          {sources.map((source, idx) => (
            <Pressable
              key={source.sourceId}
              onPress={() => openSource(source.url)}
              className="rounded-lg bg-surface-secondary/30 p-3 active:bg-surface-secondary/60"
            >
              <Text className="mb-1 text-sm font-sans-medium text-foreground">
                {source.title ?? `Source ${idx + 1}`}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {source.url}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Inline `[n]` citation chips below the message — port of web's InlineCitation row. */
export function InlineCitations({ sources }: { sources: SourceUrlPart[] }) {
  return (
    <View className="mt-1 flex-row flex-wrap gap-1">
      {sources.map((source, idx) => (
        <Pressable
          key={source.sourceId}
          onPress={() => openSource(source.url)}
          className="rounded-md bg-default px-1.5 py-0.5"
        >
          <Text
            className="text-[11px] text-muted-foreground"
            numberOfLines={1}
            style={{ maxWidth: 200 }}
          >
            [{idx + 1}] {source.title ?? `Source ${idx + 1}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

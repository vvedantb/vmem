import { useState } from "react";
import { Pressable, View } from "react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import { Text } from "@/components/ui/text";
import type { ChatMemoryRef } from "@/hooks/useChatProvider";

/**
 * One-row horizontal score bar for the memory-trace sheet.
 * Values arrive on mixed scales (fulltext can exceed 1); the bar clamps to
 * [0, 1] but the number on the right shows the raw score.
 */
function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View className="flex-row items-center gap-2">
      <Text className="w-[88px] shrink-0 text-[10px] text-muted-foreground">
        {label}
      </Text>
      <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
        <View
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${pct}%` }}
        />
      </View>
      <Text className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {value.toFixed(2)}
      </Text>
    </View>
  );
}

/**
 * Compact chips for memories pulled by retrieval — port of web's
 * MemoryRefChip, with the hover card replaced by a tap-to-open bottom sheet.
 * Legacy refs without a trace render as plain, non-tappable chips.
 */
export default function MemoryRefChips({ refs }: { refs: ChatMemoryRef[] }) {
  const [selected, setSelected] = useState<ChatMemoryRef | null>(null);

  return (
    <>
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        {refs.map((ref) => (
          <Pressable
            key={ref.id}
            disabled={!ref.trace}
            onPress={() => setSelected(ref)}
            className="rounded-md bg-default px-2 py-0.5 active:bg-surface-tertiary"
            style={{ maxWidth: 220 }}
          >
            <Text
              className="text-[11px] text-muted-foreground"
              numberOfLines={1}
            >
              {ref.title}
            </Text>
          </Pressable>
        ))}
      </View>

      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
      >
        {selected?.trace && (
          <View className="px-5 pb-5">
            <Text
              className="mb-1 text-xs font-sans-medium text-overlay-foreground"
              numberOfLines={1}
            >
              {selected.title}
            </Text>
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Retrieval score
              </Text>
              <Text className="text-sm font-sans-medium tabular-nums text-overlay-foreground">
                {selected.trace.score.toFixed(2)}
              </Text>
            </View>
            <View className="gap-1.5">
              <ScoreBar
                label="Content match"
                value={selected.trace.scoreBreakdown.fulltext}
              />
              <ScoreBar
                label="Semantic match"
                value={selected.trace.scoreBreakdown.vector}
              />
              <ScoreBar
                label="Recency"
                value={selected.trace.scoreBreakdown.recency}
              />
              <ScoreBar
                label="Confidence"
                value={selected.trace.scoreBreakdown.confidence}
              />
            </View>
            <Text className="mt-3 text-[11px] italic leading-snug text-muted-foreground">
              {selected.trace.reason}
            </Text>
          </View>
        )}
      </BottomSheet>
    </>
  );
}

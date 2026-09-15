import { Pressable, ScrollView, View } from "react-native";
import { IconSparkles } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import type { Doc } from "@vmem/backend";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

const MAX_VISIBLE_SKILLS = 8;

export function isSkillEnabled(skill: Doc<"skills">): boolean {
  return skill.enabled !== false;
}

export function filterSkillsByQuery(
  skills: Doc<"skills">[],
  query: string,
): Doc<"skills">[] {
  const normalized = query.toLowerCase();
  return skills
    .filter((skill) => skill.name.toLowerCase().startsWith(normalized))
    .slice(0, MAX_VISIBLE_SKILLS);
}

interface SkillSlashPickerProps {
  skills: Doc<"skills">[] | undefined;
  filteredSkills: Doc<"skills">[];
  onSelect: (skill: Doc<"skills">) => void;
}

/**
 * Floating skills menu anchored above the chat input while a "/" trigger is
 * open — tap-friendly port of web's ChatSkillSlashMenu. Lives inside the
 * KeyboardAvoidingView (not a Modal) so the keyboard stays up.
 */
export default function SkillSlashPicker({
  skills,
  filteredSkills,
  onSelect,
}: SkillSlashPickerProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
  const enabledCount = (skills ?? []).filter(isSkillEnabled).length;

  return (
    <View
      className="absolute left-0 right-0 rounded-xl bg-overlay"
      style={{
        bottom: "100%",
        marginBottom: 8,
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      }}
    >
      <Text className="px-3 pb-1.5 pt-2.5 text-[11px] font-sans-medium uppercase tracking-widest text-muted-foreground">
        Skills
      </Text>
      {skills === undefined ? (
        <Text className="px-3 pb-3 text-sm text-muted-foreground">
          Loading skills…
        </Text>
      ) : filteredSkills.length === 0 ? (
        <Text className="px-3 pb-3 text-sm text-muted-foreground">
          {enabledCount === 0 ? "No skills yet." : "No matching skills"}
        </Text>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="always"
          className="px-1.5 pb-1.5"
          style={{ maxHeight: 208 }}
        >
          {filteredSkills.map((skill) => (
            <Pressable
              key={skill._id}
              onPress={() => onSelect(skill)}
              className="flex-row items-start gap-2.5 rounded-md px-2.5 py-2 active:bg-surface-tertiary"
            >
              <IconSparkles
                size={16}
                color={theme.muted}
                style={{ marginTop: 2 }}
              />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-sans-medium text-overlay-foreground">
                  /{skill.name}
                </Text>
                {skill.description ? (
                  <Text
                    className="mt-0.5 text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {skill.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

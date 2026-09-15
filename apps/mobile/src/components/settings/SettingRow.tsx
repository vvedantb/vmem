import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface SettingRowProps {
  label: string;
  description?: string;
  /** Control rendered on the right (Switch, button, etc.). */
  children: ReactNode;
}

/** Label + description on the left, control on the right — web settings row layout. */
export default function SettingRow({
  label,
  description,
  children,
}: SettingRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-sans-medium text-foreground">
          {label}
        </Text>
        {description ? (
          <Text className="mt-1 text-xs text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { IconChevronLeft, IconMenu2 } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface SettingsHeaderProps {
  title: string;
  /** Hub screen shows the drawer menu; detail screens show a back chevron. */
  variant: "menu" | "back";
}

export default function SettingsHeader({
  title,
  variant,
}: SettingsHeaderProps) {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="flex-row items-center px-4 py-3">
      {variant === "menu" ? (
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
        >
          <IconMenu2 size={24} color={theme.foreground} />
        </Pressable>
      ) : (
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <IconChevronLeft size={24} color={theme.foreground} />
        </Pressable>
      )}
      <Text className="flex-1 text-center text-lg font-sans-semibold text-foreground mr-6">
        {title}
      </Text>
    </View>
  );
}

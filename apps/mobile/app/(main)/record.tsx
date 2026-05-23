import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { useColorScheme } from "nativewind";
import { IconMenu2 } from "@tabler/icons-react-native";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

export default function RecordScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
        >
          <IconMenu2 size={24} color={theme.foreground} />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-sans-semibold text-foreground mr-6">
          Record
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm text-muted-foreground text-center">
          Coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}

import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, router } from "expo-router";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useColorScheme } from "nativewind";
import {
  IconMessageCircle,
  IconMicrophone,
  IconSettings,
  IconLogout,
} from "@tabler/icons-react-native";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface NavItemConfig {
  route: string;
  label: string;
  icon: typeof IconMessageCircle;
  matchPrefix: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    route: "/",
    label: "Chat",
    icon: IconMessageCircle,
    matchPrefix: "/",
  },
  {
    route: "/record",
    label: "Record",
    icon: IconMicrophone,
    matchPrefix: "/record",
  },
  {
    route: "/settings",
    label: "Settings",
    icon: IconSettings,
    matchPrefix: "/settings",
  },
];

function NavItem({
  item,
  isActive,
  theme,
  onPress,
}: {
  item: NavItemConfig;
  isActive: boolean;
  theme: (typeof THEME_COLORS)["dark"];
  onPress: () => void;
}) {
  const Icon = item.icon;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 rounded-xl mx-2 ${
        isActive ? "bg-card" : ""
      }`}
    >
      <Icon
        size={20}
        color={isActive ? theme.foreground : theme.muted}
        strokeWidth={1.7}
      />
      <Text
        className={`text-sm font-sans-medium ${
          isActive ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function DrawerContent(props: DrawerContentComponentProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.matchPrefix === "/"
      ? pathname === "/"
      : pathname.startsWith(item.matchPrefix),
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-6 pb-4">
        <Text
          className="text-xl text-foreground"
          style={{ fontFamily: "InstrumentSerif_400Regular" }}
        >
          v
          <Text
            className="text-xl text-foreground"
            style={{ fontFamily: "InstrumentSerif_400Regular_Italic" }}
          >
            mem
          </Text>
        </Text>
      </View>

      <View className="flex-1 pt-2">
        <View className="mb-3 px-4">
          <Text className="text-[11px] font-sans-semibold text-muted-foreground/70 uppercase tracking-widest px-2">
            Workspace
          </Text>
          <View className="mt-1 mx-2 h-px bg-border/40" />
        </View>

        <View className="gap-0.5">
          {NAV_ITEMS.map((item, index) => (
            <NavItem
              key={item.route}
              item={item}
              isActive={activeIndex === index}
              theme={theme}
              onPress={() => {
                router.navigate(item.route);
                props.navigation.closeDrawer();
              }}
            />
          ))}
        </View>
      </View>

      <View className="border-t border-border/45 px-4 pb-4 pt-3">
        {user && (
          <View className="flex-row items-center gap-3 px-2 mb-3">
            <View className="h-8 w-8 rounded-full bg-card items-center justify-center">
              <Text className="text-sm font-sans-semibold text-foreground">
                {(user.firstName ?? user.emailAddresses[0]?.emailAddress ?? "?")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text
                className="text-sm font-sans-medium text-foreground"
                numberOfLines={1}
              >
                {user.fullName ??
                  user.emailAddresses[0]?.emailAddress ??
                  "User"}
              </Text>
            </View>
          </View>
        )}
        <Pressable
          onPress={() => signOut()}
          className="flex-row items-center gap-3 px-4 py-2.5 rounded-xl mx-2"
        >
          <IconLogout size={18} color={theme.destructive} strokeWidth={1.7} />
          <Text className="text-sm font-sans-medium text-destructive">
            Log out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

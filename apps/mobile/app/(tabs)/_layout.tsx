import { useAuth } from "@clerk/clerk-expo";
import { IconInbox, IconSettings } from "@tabler/icons-react-native";
import { GlassBlurProvider } from "@vvedantb/native-ui/floating";
import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "@vvedantb/native-ui/tab-bar";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import type { ColorValue } from "react-native";

type TabIconProps = { color: ColorValue; size: number };

/** Tabler icons take a colour string; the tab bar passes plain strings. */
const iconColor = (color: ColorValue) =>
  typeof color === "string" ? color : undefined;

const renderTabBar = (props: FloatingTabBarProps) => (
  <FloatingTabBar {...props} />
);
const reviewIcon = ({ color, size }: TabIconProps) => (
  <IconInbox color={iconColor(color)} size={size} />
);
const settingsIcon = ({ color, size }: TabIconProps) => (
  <IconSettings color={iconColor(color)} size={size} />
);

/** The floating pill tab bar from @vvedantb/native-ui over Expo Router tabs. */
export default function TabsLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return (
    <GlassBlurProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
        <Tabs.Screen
          name="index"
          options={{ title: "Review", tabBarIcon: reviewIcon }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "Settings", tabBarIcon: settingsIcon }}
        />
      </Tabs>
    </GlassBlurProvider>
  );
}

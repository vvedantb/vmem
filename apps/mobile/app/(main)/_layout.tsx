import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { useIsOnline } from "@/providers/NetworkProvider";

function ChatIcon({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}

function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}

function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View className="bg-yellow-50 dark:bg-yellow-900/30 px-4 py-2">
      <Text className="text-yellow-800 dark:text-yellow-200 text-xs text-center font-medium">
        Offline mode — using local AI
      </Text>
    </View>
  );
}

export default function MainLayout() {
  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#000000",
          tabBarInactiveTintColor: "#9ca3af",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => (
              <ChatIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <SettingsIcon color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

import { Tabs } from "expo-router";
import { View } from "react-native";
import { EnsureUser } from "@/components/EnsureUser";

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

export default function MainLayout() {
  return (
    <EnsureUser>
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
      </Tabs>
    </EnsureUser>
  );
}

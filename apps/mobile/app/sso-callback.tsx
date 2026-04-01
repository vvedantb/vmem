import { View, ActivityIndicator } from "react-native";

export default function SSOCallbackScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#000000" />
    </View>
  );
}

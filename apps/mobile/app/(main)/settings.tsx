import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  checkModelStatus,
  startModelDownload,
  deleteModel,
  type ModelStatus,
} from "@/services/model-manager";
import { useIsOnline } from "@/providers/NetworkProvider";

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <View
        className="h-full bg-black dark:bg-white rounded-full"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [status, setStatus] = useState<ModelStatus>({
    state: "not_downloaded",
  });
  const isOnline = useIsOnline();

  useEffect(() => {
    checkModelStatus().then(setStatus);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!isOnline) {
      Alert.alert(
        "No Internet",
        "Connect to the internet to download the AI model.",
      );
      return;
    }
    setStatus({ state: "downloading", progress: 0 });
    try {
      const path = await startModelDownload((progress) => {
        setStatus({ state: "downloading", progress });
      });
      setStatus({ state: "ready", path });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Download failed";
      setStatus({ state: "error", message });
    }
  }, [isOnline]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Model",
      "This will remove the AI model (~2GB). You'll need to re-download it to use offline chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteModel();
              setStatus({ state: "not_downloaded" });
            } catch (e) {
              const message = e instanceof Error ? e.message : "Delete failed";
              Alert.alert("Error", message);
            }
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">
          Settings
        </Text>
      </View>

      <View className="px-6">
        <View className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Offline AI Model
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Llama 3.2 3B — enables chat when offline (~2GB)
          </Text>

          {status.state === "not_downloaded" && (
            <TouchableOpacity
              onPress={handleDownload}
              className="bg-black dark:bg-white rounded-lg py-3 items-center"
            >
              <Text className="text-white dark:text-black font-semibold">
                Download Model
              </Text>
            </TouchableOpacity>
          )}

          {status.state === "downloading" && (
            <View className="gap-2">
              <ProgressBar progress={status.progress} />
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Downloading... {Math.round(status.progress)}%
              </Text>
            </View>
          )}

          {status.state === "ready" && (
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-sm text-green-700 dark:text-green-400 font-medium">
                  Ready for offline use
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleDelete}
                className="border border-red-200 dark:border-red-800 rounded-lg py-3 items-center"
              >
                <Text className="text-red-600 dark:text-red-400 font-medium">
                  Delete Model
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {status.state === "error" && (
            <View className="gap-3">
              <Text className="text-sm text-red-600 dark:text-red-400">
                {status.message}
              </Text>
              <TouchableOpacity
                onPress={handleDownload}
                className="bg-black dark:bg-white rounded-lg py-3 items-center"
              >
                <Text className="text-white dark:text-black font-semibold">
                  Retry Download
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

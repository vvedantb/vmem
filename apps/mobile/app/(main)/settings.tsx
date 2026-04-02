import { useState, useEffect, useCallback } from "react";
import { View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  checkModelStatus,
  startModelDownload,
  deleteModel,
  type ModelStatus,
} from "@/services/model-manager";
import { useIsOnline } from "@/providers/NetworkProvider";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <View
        className="h-full bg-primary rounded-full"
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
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-2xl font-bold text-foreground">Settings</Text>
      </View>

      <View className="px-6">
        <Card>
          <CardHeader>
            <CardTitle>Offline AI Model</CardTitle>
            <CardDescription>
              Llama 3.2 3B — enables chat when offline (~2GB)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status.state === "not_downloaded" && (
              <Button onPress={handleDownload}>
                <Text>Download Model</Text>
              </Button>
            )}

            {status.state === "downloading" && (
              <View className="gap-2">
                <ProgressBar progress={status.progress} />
                <Text className="text-sm text-muted-foreground text-center">
                  Downloading... {Math.round(status.progress)}%
                </Text>
              </View>
            )}

            {status.state === "ready" && (
              <View className="gap-3">
                <View className="flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-sm text-success font-medium">
                    Ready for offline use
                  </Text>
                </View>
                <Button variant="outline" onPress={handleDelete}>
                  <Text className="text-destructive">Delete Model</Text>
                </Button>
              </View>
            )}

            {status.state === "error" && (
              <View className="gap-3">
                <Text className="text-sm text-destructive">
                  {status.message}
                </Text>
                <Button onPress={handleDownload}>
                  <Text>Retry Download</Text>
                </Button>
              </View>
            )}
          </CardContent>
        </Card>
      </View>
    </SafeAreaView>
  );
}

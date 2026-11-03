import { Button } from "@vvedantb/native-ui/button";
import {
  ScreenContainer,
  SettingsSection,
  StackPageHeader,
} from "@vvedantb/native-ui/layout";
import {
  ConfirmDialog,
  Input,
  ListRow,
  Text,
} from "@vvedantb/native-ui/primitives";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { trackerActions, useTracker } from "@/sync/store";
import { TabScreen } from "@/ui/TabScreen";
import { textColor, useScheme } from "@/ui/theme";

/** The deny list. Stored natively, so background collection respects it too. */
export default function BlockedAppsScreen() {
  const { denyList, recentApps } = useTracker();
  const router = useRouter();
  const scheme = useScheme();
  const [packageName, setPackageName] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const blocked = new Set(denyList.map((entry) => entry.package));
  const suggestions = recentApps.filter((app) => !blocked.has(app.package));
  const installed = denyList.filter((entry) => entry.installed);
  const notInstalled = denyList.length - installed.length;

  return (
    <TabScreen>
      <StackPageHeader title="Blocked apps" onBack={router.back} />
      <ScreenContainer reserveTabBar>
        <SettingsSection
          title="Blocked"
          description={
            notInstalled > 0
              ? `${String(notInstalled)} more blocked apps are not installed on this phone.`
              : "These apps are never recorded."
          }
          bodyVariant="list"
        >
          {installed.length === 0 ? (
            <Text variant="muted" style={textColor(scheme, "muted")}>
              No blocked app is installed.
            </Text>
          ) : (
            installed.map((entry) => (
              <ListRow
                key={entry.package}
                title={entry.label}
                meta={entry.package}
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    fullWidth={false}
                    onPress={() => void trackerActions.unblock(entry.package)}
                  >
                    Unblock
                  </Button>
                }
              />
            ))
          )}
        </SettingsSection>

        <SettingsSection
          title="Add an app"
          description="Pick an app you used this week, or type its package name."
          bodyVariant="list"
        >
          {recentApps.length === 0 ? (
            <Button
              variant="outline"
              onPress={() => void trackerActions.loadRecentApps()}
            >
              Show apps used this week
            </Button>
          ) : (
            suggestions.map((app) => (
              <ListRow
                key={app.package}
                title={app.label}
                meta={app.package}
                control={
                  <Button
                    size="sm"
                    fullWidth={false}
                    onPress={() => void trackerActions.block(app.package)}
                  >
                    Block
                  </Button>
                }
              />
            ))
          )}
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input
                value={packageName}
                onChangeText={setPackageName}
                placeholder="com.example.app"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Package name"
              />
            </View>
            <Button
              fullWidth={false}
              disabled={packageName.trim().length === 0}
              onPress={() => {
                void trackerActions.block(packageName);
                setPackageName("");
              }}
            >
              Block
            </Button>
          </View>
        </SettingsSection>

        <Button variant="ghost" onPress={() => setConfirmReset(true)}>
          Reset to the default list
        </Button>
      </ScreenContainer>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset blocked apps?"
        description="This puts back the default messaging apps and removes the apps you added."
        confirmLabel="Reset"
        onConfirm={() => void trackerActions.resetBlocked()}
      />
    </TabScreen>
  );
}

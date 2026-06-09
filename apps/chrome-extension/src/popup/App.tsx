import { useEffect } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/chrome-extension";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import {
  IconDeviceFloppy,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconSettings,
} from "@tabler/icons-react";
import { CLERK_SYNC_HOST } from "@/lib/constants";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Card,
  CardContent,
  Spinner,
  fadeUp,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import { SettingsForm } from "./_components/SettingsForm";
import { QuickSave } from "./_components/QuickSave";
import { ImportPanel } from "./_components/ImportPanel";
import { TokenSync } from "./_components/TokenSync";
import { ExtensionUserSettingsProvider } from "./useExtensionUserSettings";
import { useTheme, useSystemTheme } from "./useTheme";

function EnsureUser() {
  const { isSignedIn, isLoaded } = useAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensureUserExists();
    }
  }, [isLoaded, isSignedIn, ensureUserExists]);

  return null;
}

function ThemeApplier() {
  useTheme();
  return null;
}

function SignedInContent() {
  return (
    <ExtensionUserSettingsProvider>
      <ThemeApplier />
      <EnsureUser />
      <TokenSync />
      <Tabs defaultValue="save" className="flex flex-1 flex-col">
        <TabsList className="mx-5 mt-4 w-auto">
          <TabsTrigger value="save" className="flex-1 gap-1.5">
            <IconDeviceFloppy size={16} stroke={1.8} />
            Save
          </TabsTrigger>
          <TabsTrigger value="import" className="flex-1 gap-1.5">
            <IconDownload size={16} stroke={1.8} />
            Import
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 gap-1.5">
            <IconSettings size={16} stroke={1.8} />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="save" className="flex-1 p-5">
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <QuickSave />
          </motion.div>
        </TabsContent>
        <TabsContent value="import" className="flex-1 p-5">
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <ImportPanel />
          </motion.div>
        </TabsContent>
        <TabsContent value="settings" className="flex-1 p-5">
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <SettingsForm />
          </motion.div>
        </TabsContent>
      </Tabs>
    </ExtensionUserSettingsProvider>
  );
}

function SignedOutContent() {
  useSystemTheme();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
      <p className="text-center text-sm text-muted text-pretty">
        Sign in to start saving memories
      </p>
      <div className="flex gap-3">
        <SignInButton mode="modal">
          <Button variant="outline">Sign in</Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button>Sign up</Button>
        </SignUpButton>
      </div>
      <Card className="max-w-full shadow-none">
        <CardContent className="flex gap-2 p-3 text-xs text-muted">
          <IconInfoCircle size={14} stroke={1.8} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-pretty">
              Dev build: sign in on the vmem site first so this extension can
              sync your session.
            </span>
            <a
              href={CLERK_SYNC_HOST}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 self-start text-foreground hover:underline"
            >
              Open vmem
              <IconExternalLink size={12} stroke={1.8} />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const { isLoaded } = useAuth();

  return (
    <div className="flex min-h-[500px] flex-col bg-background text-foreground">
      <header className="flex items-center justify-between bg-surface px-5 py-3.5">
        <span className="font-serif text-lg tracking-tight">
          v<span className="italic">mem</span>
        </span>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <main className="flex flex-1 flex-col bg-surface">
        {!isLoaded ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <Show when="signed-in">
              <SignedInContent />
            </Show>
            <Show when="signed-out">
              <SignedOutContent />
            </Show>
          </>
        )}
      </main>
    </div>
  );
}

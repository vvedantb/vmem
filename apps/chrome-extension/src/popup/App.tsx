import { useEffect } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/chrome-extension";
import { useMutation } from "convex/react";
import {
  IconDeviceFloppy,
  IconDownload,
  IconSettings,
} from "@tabler/icons-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Spinner,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import { SettingsForm } from "./_components/SettingsForm";
import { QuickSave } from "./_components/QuickSave";
import { ImportPanel } from "./_components/ImportPanel";
import { TokenSync } from "./_components/TokenSync";

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

function SignedInContent() {
  return (
    <>
      <EnsureUser />
      <TokenSync />
      <Tabs defaultValue="save" className="flex flex-1 flex-col">
        <TabsList className="mx-3 mt-3 w-auto">
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
          <QuickSave />
        </TabsContent>
        <TabsContent value="import" className="flex-1 p-5">
          <ImportPanel />
        </TabsContent>
        <TabsContent value="settings" className="flex-1 p-5">
          <SettingsForm />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SignedOutContent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-sm text-muted-foreground text-center">
        Sign in to start saving memories
      </p>
      <div className="flex gap-3">
        <SignInButton mode="modal">
          <Button variant="default">Sign in</Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button variant="outline">Sign up</Button>
        </SignUpButton>
      </div>
    </div>
  );
}

export function App() {
  const { isLoaded } = useAuth();

  return (
    <div className="glass-panel text-foreground min-h-[500px] flex flex-col">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-serif tracking-tight">
            v<span className="italic">mem</span>
          </span>
        </div>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

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
    </div>
  );
}

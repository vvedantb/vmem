import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ClerkFailed,
  ClerkLoading,
  Show,
  SignIn,
  SignOutButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/electron/react";
import {
  IconVmem,
  Button,
  Card,
  Input,
  Label,
  LabeledSwitchRow,
  SonnerToaster,
  Textarea,
} from "@vvedantb/ui";
import { saveSettings, useViewState } from "./desktop-state";

const MIN_MINUTES = 1;
const MAX_MINUTES = 240;

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
      {title}
    </h2>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title={title} />
      <Card className="flex flex-col gap-4 p-5">{children}</Card>
    </section>
  );
}

/**
 * Tells main when the user signs in or out. Main gates recording and uploads on it and keeps it across
 * restarts. This syncs an external system (main), so an effect is the right tool.
 */
function useReportSignedIn(): void {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded) window.vmemDesktop.reportSignedIn(isSignedIn === true);
  }, [isLoaded, isSignedIn]);
}

function SignedInAccount() {
  const { user } = useUser();
  const name = user?.fullName ?? undefined;
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <UserButton />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {name ?? email ?? "Signed in"}
          </p>
          {name !== undefined && email !== undefined ? (
            <p className="truncate text-xs text-muted">{email}</p>
          ) : null}
        </div>
      </div>
      <SignOutButton>
        <Button variant="outline" size="sm">
          Sign out
        </Button>
      </SignOutButton>
    </div>
  );
}

function AccountSection({ usingSavedKey }: { usingSavedKey: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Account" />
      <ClerkLoading>
        <Card className="p-5">
          <p className="text-sm text-muted">Loading…</p>
        </Card>
      </ClerkLoading>
      <Show when="signed-in">
        <Card className="p-5">
          <SignedInAccount />
        </Card>
      </Show>
      <Show when="signed-out">
        <p className="px-1 text-sm text-muted text-pretty">
          {usingSavedKey
            ? "vmem is using an API key saved by an earlier version. Sign in to replace it."
            : "vmem needs you to sign in before it records anything."}
        </p>
        <SignIn routing="hash" withSignUp />
      </Show>
      <ClerkFailed>
        <Card className="p-5">
          <p className="text-sm text-muted text-pretty">
            Sign-in could not load. Check your connection, then open vmem again
            from the tray.
          </p>
        </Card>
      </ClerkFailed>
    </section>
  );
}

function MinutesField({
  id,
  label,
  description,
  value,
  onSave,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  onSave: (minutes: number) => void;
}) {
  // Uncontrolled: the user can clear the box while typing. It saves on blur or Enter, and `key` resets it to the saved value.
  function commit(input: HTMLInputElement): void {
    const next = Number(input.value);
    if (next === value) return;
    if (!Number.isInteger(next) || next < MIN_MINUTES || next > MAX_MINUTES) {
      input.value = String(value);
      toast.error(`Enter a whole number from ${MIN_MINUTES} to ${MAX_MINUTES}`);
      return;
    }
    onSave(next);
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted text-pretty">{description}</p>
      </div>
      <Input
        key={value}
        id={id}
        type="number"
        min={MIN_MINUTES}
        max={MAX_MINUTES}
        defaultValue={value}
        className="w-24 shrink-0"
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function App() {
  const state = useViewState();
  useReportSignedIn();
  if (state === null) return null;
  const { settings, auth } = state;
  const blocklistText = settings.blocklist.join("\n");

  function commitBlocklist(text: string): void {
    if (text === blocklistText) return;
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    void saveSettings({ blocklist: lines });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5">
      <header className="flex items-center gap-3">
        <IconVmem size={32} className="text-foreground" />
        <h1 className="text-xl font-semibold">vmem</h1>
      </header>

      <AccountSection usingSavedKey={auth.usingSavedKey} />

      <Section title="Recording">
        <LabeledSwitchRow
          id="paused"
          label="Pause recording"
          checked={settings.paused}
          onCheckedChange={(paused) => void saveSettings({ paused })}
        />
        <MinutesField
          id="idleThresholdMinutes"
          label="Idle threshold (minutes)"
          description="No keyboard or mouse input for this long ends the session."
          value={settings.idleThresholdMinutes}
          onSave={(idleThresholdMinutes) =>
            void saveSettings({ idleThresholdMinutes })
          }
        />
        <MinutesField
          id="flushIntervalMinutes"
          label="Summary interval (minutes)"
          description="How often vmem saves a summary of your activity."
          value={settings.flushIntervalMinutes}
          onSave={(flushIntervalMinutes) =>
            void saveSettings({ flushIntervalMinutes })
          }
        />
      </Section>

      <Section title="Capture">
        <LabeledSwitchRow
          id="clipboardEnabled"
          label="Capture clipboard text"
          checked={settings.clipboardEnabled}
          onCheckedChange={(clipboardEnabled) =>
            void saveSettings({ clipboardEnabled })
          }
        />
        <LabeledSwitchRow
          id="screenshotsEnabled"
          label="Capture screenshots (stored locally)"
          checked={settings.screenshotsEnabled}
          onCheckedChange={(screenshotsEnabled) =>
            void saveSettings({ screenshotsEnabled })
          }
        />
        <LabeledSwitchRow
          id="launchAtLogin"
          label="Launch at login"
          checked={settings.launchAtLogin}
          onCheckedChange={(launchAtLogin) =>
            void saveSettings({ launchAtLogin })
          }
        />
      </Section>

      <Section title="Blocklist">
        <div className="flex flex-col gap-2">
          <Label htmlFor="blocklist" className="text-sm font-medium">
            Apps and window titles to skip
          </Label>
          <Textarea
            key={blocklistText}
            id="blocklist"
            rows={5}
            defaultValue={blocklistText}
            placeholder="One app or title fragment per line"
            onBlur={(event) => commitBlocklist(event.currentTarget.value)}
          />
          <p className="text-xs text-muted text-pretty">
            Password managers and private browsing windows are always blocked.
          </p>
        </div>
      </Section>

      <SonnerToaster position="top-right" />
    </main>
  );
}

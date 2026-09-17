import { useState } from "react";
import { Button, Input } from "@vmem/ui";
import { unlockPresenter } from "../slidesGate";

interface SlidesPasswordGateProps {
  onUnlocked: () => void;
}

/** Blocks presenter pop-out until password is entered (once per tab). */
export function SlidesPasswordGate({ onUnlocked }: SlidesPasswordGateProps) {
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const raw = data.get("password");
    if (typeof raw !== "string") return;
    if (unlockPresenter(raw)) {
      setError(false);
      onUnlocked();
      return;
    }
    setError(true);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-surface-secondary/40 p-6"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-foreground">
            Presenter view
          </h1>
          <p className="text-sm text-muted">
            Enter the password to open your script and controls. The main deck
            stays public.
          </p>
        </div>

        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          autoFocus
          aria-invalid={error}
        />

        {error ? (
          <p className="text-sm text-danger">Wrong password. Try again.</p>
        ) : null}

        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </div>
  );
}

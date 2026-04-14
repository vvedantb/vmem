import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/chrome-extension";
import { Button, Label, Switch } from "@vmem/ui";
import { getStorage, setStorage } from "@/lib/storage";

export function SettingsForm() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [selectionPopupEnabled, setSelectionPopupEnabled] = useState(true);

  useEffect(() => {
    getStorage().then((s) => {
      setSelectionPopupEnabled(s.selectionPopupEnabled);
    });
  }, []);

  function handleSelectionPopupToggle(checked: boolean) {
    setSelectionPopupEnabled(checked);
    setStorage({ selectionPopupEnabled: checked });
  }

  return (
    <div className="space-y-5">
      {user && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user.fullName ?? user.primaryEmailAddress?.emailAddress}
            </p>
            {user.fullName && (
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="selection-popup-toggle" className="text-sm">
          Save popup on text selection
        </Label>
        <Switch
          id="selection-popup-toggle"
          checked={selectionPopupEnabled}
          onCheckedChange={handleSelectionPopupToggle}
        />
      </div>

      <Button
        variant="ghost"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => signOut()}
      >
        Sign Out
      </Button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/chrome-extension";
import { Button, Input, Label } from "@vmem/ui";
import { getStorage, setStorage } from "@/lib/storage";

export function SettingsForm() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [apiUrl, setApiUrl] = useState("");

  useEffect(() => {
    getStorage().then((s) => setApiUrl(s.apiUrl));
  }, []);

  function handleApiUrlChange(value: string) {
    setApiUrl(value);
    setStorage({ apiUrl: value });
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

      <div className="space-y-1.5">
        <Label>API URL</Label>
        <Input
          type="url"
          value={apiUrl}
          onChange={(e) => handleApiUrlChange(e.target.value)}
          placeholder="https://vmem-api.up.railway.app"
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

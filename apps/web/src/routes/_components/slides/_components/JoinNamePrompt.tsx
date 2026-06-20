import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from "@vmem/ui";

interface JoinNamePromptProps {
  /** Presenter's name, if the session has resolved it. */
  hostName: string | null;
  /** Called with the chosen display name (falls back to "Guest"). */
  onSubmit: (name: string) => void;
}

/**
 * Blocking prompt shown to an anonymous viewer the first time they open a
 * share link. The name is only used so the presenter can see who is watching;
 * it cannot be dismissed without choosing one (defaults to "Guest").
 */
export function JoinNamePrompt({ hostName, onSubmit }: JoinNamePromptProps) {
  const [value, setValue] = useState("");

  const submit = () => onSubmit(value);

  return (
    <Dialog open>
      <DialogContent
        hideCloseButton
        className="max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Join the presentation</DialogTitle>
          <DialogDescription>
            {hostName
              ? `${hostName} is presenting live.`
              : "You're joining a live presentation."}{" "}
            Add a name so the presenter knows who&rsquo;s watching.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Your name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <div className="flex justify-end">
          <Button onClick={submit}>Join</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

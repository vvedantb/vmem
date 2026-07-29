import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

interface AddMemberDialogProps {
  teamId: Id<"teams">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({
  teamId,
  open,
  onOpenChange,
}: AddMemberDialogProps) {
  const addMember = useMutation(api.teams.addMember);
  const [email, setEmail] = useState("");
  const { submitting, run } = useAsyncSubmit();

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await run(async () => {
      await addMember({ teamId, email: trimmed });
      toast.success(`Added ${trimmed}`);
      onOpenChange(false);
      setEmail("");
    }, "Failed to add member");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) setEmail("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Enter the email address of a vmem user. They&apos;ll be added
            immediately and start seeing the team profile in their dropdown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">Email</label>
          <Input
            autoFocus
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <IconLoader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

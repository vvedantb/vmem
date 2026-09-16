import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  cn,
} from "@vmem/ui";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  IconUserCog,
  IconLogout,
  IconSun,
  IconMoon,
  IconAlertTriangle,
  IconLoader2,
} from "@tabler/icons-react";
import { useThemeContext } from "@/contexts/ThemeContext";
import { RAIL_TILE_CLASS, railTileStateClass } from "./sidebar-nav-row";

export function SidebarUserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const { isDark, toggleTheme } = useThemeContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const email = user.primaryEmailAddress?.emailAddress;
  const name = user.fullName ?? email ?? "Account";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            title={name}
            aria-label={`Account menu for ${name}`}
            className={cn(
              RAIL_TILE_CLASS,
              "h-11 w-11 p-0",
              railTileStateClass(false),
            )}
          >
            <img
              src={user.imageUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover outline outline-1 -outline-offset-1 outline-separator"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="right"
          sideOffset={8}
          className="w-56"
        >
          <DropdownMenuLabel className="flex items-center gap-2 font-normal normal-case tracking-normal">
            <img
              src={user.imageUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-separator"
            />
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openUserProfile()}>
            <IconUserCog />
            Manage account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleTheme()}>
            {isDark ? <IconSun /> : <IconMoon />}
            {isDark ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-danger focus:text-danger data-[highlighted]:text-danger"
          >
            <IconLogout />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !isSigningOut) setConfirmOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Sign out</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm signing out of your account
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
              <IconAlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <p className="text-foreground">Sign out of your account?</p>
              <p className="mt-1 text-sm text-muted">
                You'll need to sign back in to access your memories.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={isSigningOut}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="bg-danger text-danger-foreground"
            >
              {isSigningOut ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Signing out...
                </>
              ) : (
                "Sign out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

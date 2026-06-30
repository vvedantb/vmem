"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
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
  IconSelector,
  IconAlertTriangle,
  IconLoader2,
} from "@tabler/icons-react";
import { useThemeContext } from "../contexts/ThemeContext";
import { SidebarIconTooltip } from "./SidebarIconTooltip";

type SidebarUserMenuProps = {
  /** Collapsed (icon-only) rail shows just the avatar; dropdown opens to the side. */
  collapsed: boolean;
};

/**
 * The footer identity card, doubling as the account menu trigger. Clicking it
 * opens a dropdown with manage account, the theme toggle, and sign out — so the
 * footer is a single clean row instead of an avatar plus a separate button.
 *
 * Sign out is destructive, so it opens a confirmation dialog (rendered as a
 * sibling of the dropdown, controlled by `confirmOpen`, so the menu can close
 * cleanly before the dialog traps focus).
 *
 * Uses Clerk's `useUser` for identity (avatar/name/email) and `useClerk` for the
 * account/sign-out actions, rather than Clerk's prebuilt `<UserButton>`, so the
 * trigger matches the rest of the sidebar's styling.
 */
export function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
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
      // On failure, drop the pending state so the user can retry or cancel.
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {collapsed ? (
            <SidebarIconTooltip label={name} enabled>
              <button
                type="button"
                className="mx-auto flex items-center justify-center rounded-lg p-1 transition-[background-color] hover:bg-surface-tertiary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <img
                  src={user.imageUrl}
                  alt={name}
                  className="h-7 w-7 rounded-full object-cover outline outline-1 -outline-offset-1 outline-separator"
                />
              </button>
            </SidebarIconTooltip>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg bg-surface-secondary p-2 text-left transition-[background-color] hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <img
                src={user.imageUrl}
                alt={name}
                className="h-7 w-7 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-separator"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-foreground">
                  {name}
                </p>
                {email && (
                  <p className="truncate text-xs leading-tight text-muted">
                    {email}
                  </p>
                )}
              </div>
              <IconSelector className="h-4 w-4 shrink-0 text-muted" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={collapsed ? "center" : "start"}
          side={collapsed ? "right" : "top"}
          sideOffset={collapsed ? 8 : 6}
          className={cn(
            collapsed
              ? "w-56"
              : "w-[var(--radix-dropdown-menu-trigger-width)] min-w-56",
          )}
        >
          <DropdownMenuItem onSelect={() => void openUserProfile()}>
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

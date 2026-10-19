import { useState } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  SidebarAccountMenu,
  SignOutDialog,
  ConfirmSkipHint,
  skipConfirmTitle,
  useRequestConfirm,
} from "@vvedantb/ui";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  IconUserCog,
  IconLogout,
  IconSun,
  IconMoon,
} from "@tabler/icons-react";
import { useThemeContext } from "@/contexts/ThemeContext";

export function SidebarUserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const { isDark, toggleTheme } = useThemeContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { request } = useRequestConfirm();

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
      <SidebarAccountMenu name={name} imageUrl={user.imageUrl}>
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
          onSelect={() =>
            request(
              () => setConfirmOpen(true),
              () => {
                void handleSignOut();
              },
            )
          }
          className="text-danger focus:text-danger data-[highlighted]:text-danger"
          title={skipConfirmTitle("Sign out")}
        >
          <IconLogout />
          Sign out
          <ConfirmSkipHint />
        </DropdownMenuItem>
      </SidebarAccountMenu>

      <SignOutDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={isSigningOut}
        onConfirm={handleSignOut}
        description="You'll need to sign back in to access your memories."
      />
    </>
  );
}

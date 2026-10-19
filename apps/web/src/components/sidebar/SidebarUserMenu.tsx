import { DropdownMenuItem, SidebarAccountMenu } from "@vvedantb/ui";
import { useUser, useClerk } from "@clerk/clerk-react";
import { IconUserCog } from "@tabler/icons-react";
import { useThemeContext } from "@/contexts/ThemeContext";

export function SidebarUserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const { isDark, toggleTheme } = useThemeContext();

  if (!user) return null;

  const email = user.primaryEmailAddress?.emailAddress;
  const name = user.fullName ?? email ?? "Account";

  return (
    <SidebarAccountMenu
      name={name}
      imageUrl={user.imageUrl}
      themeToggle={{ isDark, onToggle: toggleTheme }}
      signOut={{
        onSignOut: () => signOut(),
        description: "You'll need to sign back in to access your memories.",
      }}
    >
      <DropdownMenuItem onSelect={() => openUserProfile()}>
        <IconUserCog />
        Manage account
      </DropdownMenuItem>
    </SidebarAccountMenu>
  );
}

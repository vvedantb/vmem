import { DropdownMenuItem, SidebarAccountMenu } from "@vvedantb/ui";
import { useUser, useClerk } from "@clerk/clerk-react";
import { IconSparkles, IconUserCog } from "@tabler/icons-react";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useHasVPlan } from "@/lib/vPlan";
import { openPricingModal } from "@/lib/pricing-modal";

export function SidebarUserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const { isDark, toggleTheme } = useThemeContext();
  const hasPro = useHasVPlan();

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
      {hasPro ? (
        <DropdownMenuItem disabled>
          <IconSparkles />V Pro
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem onSelect={() => openPricingModal()}>
          <IconSparkles />
          Upgrade to V Pro
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => openUserProfile()}>
        <IconUserCog />
        Manage account
      </DropdownMenuItem>
    </SidebarAccountMenu>
  );
}

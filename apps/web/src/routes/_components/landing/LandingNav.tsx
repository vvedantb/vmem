import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { motion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { VmemBrand } from "@/components/shell/VmemBrand";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";
import { LandingNavMenu } from "./LandingNavMenu";
import { landingShellClass } from "./LandingReveal";

export function LandingNav() {
  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-separator bg-background/80 backdrop-blur-md"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
    >
      <div
        className={cn(
          landingShellClass,
          "flex h-14 items-center justify-between gap-3 sm:h-16",
        )}
      >
        <a
          href="#top"
          className="group min-w-0 shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="vmem home"
        >
          <VmemBrand />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Page">
          {LANDING_NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted transition-[color,background-color] duration-150 hover:bg-surface-tertiary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
          >
            <a
              href={VMEM_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="vmem on GitHub"
            >
              <IconBrandGithub size={18} />
            </a>
          </Button>
          <SignInButton mode="modal">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted hover:text-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="px-3.5">
              Get started
            </Button>
          </SignUpButton>
          <LandingNavMenu />
        </div>
      </div>
    </motion.header>
  );
}

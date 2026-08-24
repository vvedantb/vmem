import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { motion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { VmemBrand } from "@/components/shell/VmemBrand";
import { landingShellClass } from "./LandingReveal";

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#recall", label: "Recall" },
  { href: "#surfaces", label: "Surfaces" },
] as const;

export function LandingNav() {
  return (
    <motion.header
      className="sticky top-0 z-30 bg-background/80 shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_1px_0_rgba(255,255,255,0.08)]"
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
          className="group min-w-0 shrink-0"
          aria-label="vmem home"
        >
          <VmemBrand />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Page">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted transition-[color,background-color] duration-150 hover:bg-surface-tertiary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="px-3.5">
              Get started
            </Button>
          </SignUpButton>
        </div>
      </div>
    </motion.header>
  );
}

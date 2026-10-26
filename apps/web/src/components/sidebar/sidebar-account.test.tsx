// @vitest-environment happy-dom
// Pins the rail footer markup (collapse tile, account menu, its open menu and
// the sign-out dialog) and the handlers each item calls.
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@vvedantb/ui";
import { mount, resetDocument, type Mounted } from "@/test/dom";

const clerk = vi.hoisted(() => ({
  user: {
    fullName: "Test User",
    imageUrl: "https://example.com/avatar.png",
    primaryEmailAddress: { emailAddress: "user@example.com" },
  },
  has: vi.fn((_params: { plan: string }) => false),
  openUserProfile: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));
const server = vi.hoisted(() => ({ pro: false }));
const pricing = vi.hoisted(() => ({ open: vi.fn() }));
const theme = vi.hoisted(() => ({ isDark: false, toggleTheme: vi.fn() }));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => server.pro,
}));
vi.mock("@clerk/clerk-react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUser: () => ({ user: clerk.user }),
  useAuth: () => ({ has: clerk.has, sessionClaims: null }),
  useClerk: () => clerk,
}));
vi.mock("@/lib/pricing-modal", () => ({
  openPricingModal: pricing.open,
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useThemeContext: () => theme,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { SidebarUserMenu } = await import("./SidebarUserMenu");
const { VmemSidebarRail } = await import("./SidebarRail");
const { SidebarFooter } = await import("./SidebarFooter");

function html(): string {
  return document.body.innerHTML.replace(
    /radix-«r[0-9a-z]+»|radix-_r_[0-9a-z]+_|«r[0-9a-z]+»|_r_[0-9a-z]+_/gi,
    "«id»",
  );
}

function button(label: string): HTMLElement {
  const found = [
    ...document.querySelectorAll<HTMLElement>("button, [role='menuitem']"),
  ].find(
    (el) =>
      el.getAttribute("aria-label") === label ||
      el.textContent?.trim() === label ||
      // The sign-out item also holds the Alt-skip hint.
      (el.getAttribute("role") === "menuitem" &&
        el.textContent?.trim().startsWith(label)),
  );
  if (!found) throw new Error(`no ${label}`);
  return found;
}

async function openMenu() {
  const trigger = button("Account menu for Test User");
  await act(async () => {
    trigger.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

let mounted: Mounted | null = null;

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  resetDocument();
  vi.clearAllMocks();
  theme.isDark = false;
  clerk.has.mockImplementation(() => false);
  server.pro = false;
});

describe("SidebarUserMenu", () => {
  it("renders the closed trigger", async () => {
    mounted = await mount(<SidebarUserMenu />);
    expect(html()).toMatchSnapshot();
  });

  it("renders the open menu in light and dark mode", async () => {
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    expect(html()).toMatchSnapshot("light");
    await click(button("Dark mode"));
    expect(theme.toggleTheme).toHaveBeenCalledTimes(1);

    await mounted.unmount();
    resetDocument();
    theme.isDark = true;
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    expect(button("Light mode")).toBeTruthy();
    expect(html()).toMatchSnapshot("dark");
  });

  it("opens Manage account", async () => {
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    await click(button("Manage account"));
    expect(clerk.openUserProfile).toHaveBeenCalledTimes(1);
  });

  it("shows Upgrade and opens the pricing modal from it", async () => {
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    expect(pricing.open).not.toHaveBeenCalled();
    await click(button("Upgrade to V Pro"));
    expect(pricing.open).toHaveBeenCalledTimes(1);
  });

  it.each(["v_pro", "vibot_pro"])(
    "shows V Pro status instead of Upgrade for the %s plan",
    async (plan) => {
      clerk.has.mockImplementation((params) => params.plan === plan);
      mounted = await mount(<SidebarUserMenu />);
      await openMenu();
      expect(button("V Pro").getAttribute("aria-disabled")).toBe("true");
      expect(() => button("Upgrade to V Pro")).toThrow();
    },
  );

  it("shows V Pro status for a server Pro user without a paid plan", async () => {
    server.pro = true;
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    expect(button("V Pro").getAttribute("aria-disabled")).toBe("true");
    expect(() => button("Upgrade to V Pro")).toThrow();
  });

  // happy-dom + Radix: opening SignOutDialog from the open dropdown overflows
  // the call stack (two focus scopes). Reproduces on main without this PR.
  // SignOutDialog itself is covered in @vvedantb/ui.
  it.skip("opens the sign out dialog", async () => {
    mounted = await mount(<SidebarUserMenu />);
    await openMenu();
    await click(button("Sign out"));
    expect(clerk.signOut).not.toHaveBeenCalled();
    expect(
      document.querySelector("[role='alertdialog'], [role='dialog']"),
    ).toBeTruthy();
    expect(html()).toMatchSnapshot();
  });
});

describe("VmemSidebarRail footer", () => {
  function rail(
    layout: "desktop" | "drawer",
    isCollapsed: boolean,
    onToggleCollapse = vi.fn(),
    isPanelHidden = false,
  ) {
    return (
      <TooltipProvider>
        <VmemSidebarRail
          layout={layout}
          pathname="/p1/memories"
          profileId="p1"
          isTeamWorkspace={false}
          unreadCount={0}
          proposalsCount={0}
          isCollapsed={isCollapsed}
          isPanelHidden={isPanelHidden}
          isAuthLoading={false}
          onToggleCollapse={onToggleCollapse}
          onOpenSearch={vi.fn()}
        />
      </TooltipProvider>
    );
  }

  const layouts: Array<["desktop" | "drawer", boolean]> = [
    ["desktop", false],
    ["desktop", true],
    ["drawer", false],
  ];

  it.each(layouts)(
    "renders the %s rail (collapsed: %s)",
    async (layout, isCollapsed) => {
      mounted = await mount(rail(layout, isCollapsed));
      expect(html()).toMatchSnapshot();
    },
  );

  it("toggles the panel from the collapse tile", async () => {
    const onToggleCollapse = vi.fn();
    mounted = await mount(rail("desktop", false, onToggleCollapse));
    await click(button("Hide sidebar"));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    await mounted.rerender(rail("desktop", true, onToggleCollapse));
    await click(button("Show sidebar"));
    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it("shows the compact upgrade card on the collapsed rail only", async () => {
    mounted = await mount(rail("desktop", true));
    await click(button("Upgrade to Pro"));
    expect(pricing.open).toHaveBeenCalledTimes(1);

    await mounted.rerender(rail("desktop", false));
    expect(() => button("Upgrade to Pro")).toThrow();
  });

  it("keeps the compact upgrade card off the rail when only the panel is hidden", async () => {
    mounted = await mount(rail("desktop", false, vi.fn(), true));
    expect(() => button("Upgrade to Pro")).toThrow();
  });

  it("hides the rail upgrade card for V Pro users", async () => {
    clerk.has.mockImplementation((params) => params.plan === "v_pro");
    mounted = await mount(rail("desktop", true));
    expect(() => button("Upgrade to Pro")).toThrow();
  });
});

describe("SidebarFooter upgrade card", () => {
  it("opens pricing for free users and hides for V Pro", async () => {
    const footer = (
      <SidebarFooter
        isMobile={false}
        stats={{ addedToday: 0, total: 0 }}
        showStats={false}
      />
    );
    mounted = await mount(footer);
    expect(document.body.textContent).toContain("Upgrade to Pro");
    await click(button("Upgrade"));
    expect(pricing.open).toHaveBeenCalledTimes(1);

    await mounted.unmount();
    resetDocument();
    clerk.has.mockImplementation((params) => params.plan === "v_pro");
    mounted = await mount(footer);
    expect(document.body.textContent).not.toContain("Upgrade to Pro");
  });
});

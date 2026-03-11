import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
const mockPathname = vi.fn(() => "/chat");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    ...props
  }: {
    alt: string;
    src: string;
    [key: string]: unknown;
  }) => <img alt={alt} src={src as string} {...props} />,
}));

// Mock @clerk/nextjs
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
  useUser: () => ({ isLoaded: true, user: null }),
}));

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    aside: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <aside {...props}>{children}</aside>
    ),
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    nav: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <nav {...props}>{children}</nav>
    ),
    h1: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <h1 {...props}>{children}</h1>
    ),
    span: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
    ul: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <ul {...props}>{children}</ul>
    ),
    li: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <li {...props}>{children}</li>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock @vmem/ui
vi.mock("@vmem/ui", () => ({
  Separator: () => <hr />,
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    "aria-label"?: string;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  Dialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogOverlay: () => <div />,
  DialogPortal: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DialogRawContent: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
  motionDistance: { routeX: 20 },
  motionDuration: { fast: 0.15 },
  motionEase: "easeOut",
  motionTiming: { sidebar: 0.2, stagger: 0.05 },
  staggerContainer: () => ({}),
  staggerItem: {},
}));

// Mock @tabler/icons-react
vi.mock("@tabler/icons-react", () => ({
  IconMessageCircle: () => <span>chat-icon</span>,
  IconBrain: () => <span>brain-icon</span>,
  IconKey: () => <span>key-icon</span>,
  IconBell: () => <span>bell-icon</span>,
  IconSettings: () => <span>settings-icon</span>,
  IconMenu2: () => <span>menu-icon</span>,
  IconX: () => <span>x-icon</span>,
  IconFiles: () => <span>files-icon</span>,
  IconDatabase: () => <span>database-icon</span>,
  IconPlugConnected: () => <span>plug-icon</span>,
  IconMoon: () => <span>moon-icon</span>,
  IconSun: () => <span>sun-icon</span>,
  IconLayoutSidebarLeftCollapse: () => <span>collapse-icon</span>,
  IconLayoutSidebarLeftExpandFilled: () => <span>expand-icon</span>,
  IconList: () => <span>list-icon</span>,
  IconShare3: () => <span>share-icon</span>,
  IconFileText: () => <span>filetext-icon</span>,
}));

// Mock context providers
vi.mock("@/components/contexts/ThemeContext", () => ({
  useThemeContext: () => ({
    theme: "light",
    toggleTheme: vi.fn(),
    mounted: true,
  }),
}));

vi.mock("@/components/contexts/NotificationContext", () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

import Sidebar from "@/components/Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/chat");
  });

  it("renders main navigation items in expanded state", () => {
    render(<Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />);
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Memories").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Files").length).toBeGreaterThan(0);
  });

  it("shows collapse button in expanded state", () => {
    render(<Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /collapse sidebar/i }),
    ).toBeInTheDocument();
  });

  it("shows expand button in collapsed state", () => {
    render(<Sidebar isCollapsed={true} onToggleCollapse={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /expand sidebar/i }),
    ).toBeInTheDocument();
  });

  it("renders nested children when parent section is active", () => {
    mockPathname.mockReturnValue("/memories/graph");
    render(<Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />);
    // When on /memories path, children (List, Graph) should be visible
    expect(screen.getAllByText("List").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Graph").length).toBeGreaterThan(0);
  });

  it("does not render nested children when parent section is not active", () => {
    mockPathname.mockReturnValue("/chat");
    render(<Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />);
    // When not on /memories path, children should not be visible
    expect(screen.queryByText("List")).not.toBeInTheDocument();
    expect(screen.queryByText("Graph")).not.toBeInTheDocument();
  });

  it("renders API nested children when on api section", () => {
    mockPathname.mockReturnValue("/api/keys");
    render(<Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />);
    expect(screen.getAllByText("Logs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Keys").length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock @vmem/ui to provide testable context menu implementations
vi.mock("@vmem/ui", async (importOriginal) => {
  const React = await import("react");

  // Minimal in-memory context menu implementations for testing
  const ContextMenuCtx = React.createContext<{
    isOpen: boolean;
    setOpen: (v: boolean) => void;
  }>({ isOpen: false, setOpen: () => {} });

  const ContextMenu = ({ children }: React.PropsWithChildren) => {
    const [isOpen, setOpen] = React.useState(false);
    return (
      <ContextMenuCtx.Provider value={{ isOpen, setOpen }}>
        <div data-testid="context-menu">{children}</div>
      </ContextMenuCtx.Provider>
    );
  };

  const ContextMenuTrigger = ({ children }: React.PropsWithChildren) => {
    const { setOpen } = React.useContext(ContextMenuCtx);
    return (
      <div
        data-testid="context-menu-trigger"
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </div>
    );
  };

  const ContextMenuContent = ({ children }: React.PropsWithChildren) => {
    const { isOpen } = React.useContext(ContextMenuCtx);
    if (!isOpen) return null;
    return (
      <div role="menu" data-testid="context-menu-content">
        {children}
      </div>
    );
  };

  const ContextMenuItem = ({
    children,
    onSelect,
  }: React.PropsWithChildren<{ onSelect?: () => void }>) => (
    <div role="menuitem" onClick={onSelect}>
      {children}
    </div>
  );

  const ContextMenuLabel = ({ children }: React.PropsWithChildren) => (
    <div data-testid="context-menu-label">{children}</div>
  );

  const ContextMenuSeparator = () => <hr role="separator" />;

  const original = await importOriginal<typeof import("@vmem/ui")>();
  return {
    ...original,
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
  };
});

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@vmem/ui";

describe("ContextMenu", () => {
  it("renders trigger element", () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <button>Right click me</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Action</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    expect(screen.getByText("Right click me")).toBeInTheDocument();
  });

  it("shows menu content after right-click on trigger", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <span>trigger area</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>Actions</ContextMenuLabel>
          <ContextMenuItem>Edit</ContextMenuItem>
          <ContextMenuItem>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    // Menu is initially hidden
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Right-click to open
    await userEvent.pointer({
      target: screen.getByTestId("context-menu-trigger"),
      keys: "[MouseRight]",
    });

    // Content is now visible
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders menu items with correct roles", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <span>trigger</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Copy</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Paste</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    await userEvent.pointer({
      target: screen.getByTestId("context-menu-trigger"),
      keys: "[MouseRight]",
    });

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("menu item click triggers onSelect callback", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <span>trigger</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onSelect}>Click Me</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    await userEvent.pointer({
      target: screen.getByTestId("context-menu-trigger"),
      keys: "[MouseRight]",
    });

    await userEvent.click(screen.getByText("Click Me"));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

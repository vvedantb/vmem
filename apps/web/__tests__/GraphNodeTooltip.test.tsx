import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";

describe("GraphNodeTooltip", () => {
  it("renders title and content", () => {
    render(
      <GraphNodeTooltip
        title="Test Title"
        content="Test content"
        x={100}
        y={200}
      />,
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("has role=tooltip for accessibility", () => {
    render(<GraphNodeTooltip title="A" content="B" x={0} y={0} />);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("has aria-live=polite for dynamic announcements", () => {
    render(<GraphNodeTooltip title="A" content="B" x={0} y={0} />);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveAttribute("aria-live", "polite");
  });

  it("positions tooltip using x and y props", () => {
    render(<GraphNodeTooltip title="A" content="B" x={50} y={80} />);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveStyle({ left: "62px", top: "70px" });
  });
});

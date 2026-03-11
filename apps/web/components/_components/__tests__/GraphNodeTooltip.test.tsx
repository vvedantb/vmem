import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphNodeTooltip from "../GraphNodeTooltip";

describe("GraphNodeTooltip", () => {
  it("renders with role=tooltip", () => {
    const { container } = render(
      <GraphNodeTooltip
        title="Test Node"
        content="Test content"
        x={100}
        y={200}
      />,
    );
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
  });

  it("displays title and content", () => {
    render(
      <GraphNodeTooltip
        title="Memory Title"
        content="Memory content here"
        x={0}
        y={0}
      />,
    );
    expect(screen.getByText("Memory Title")).toBeDefined();
    expect(screen.getByText("Memory content here")).toBeDefined();
  });

  it("positions based on x and y props", () => {
    const { container } = render(
      <GraphNodeTooltip title="T" content="C" x={50} y={80} />,
    );
    const tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tooltip.style.left).toBe("62px");
    expect(tooltip.style.top).toBe("70px");
  });
});

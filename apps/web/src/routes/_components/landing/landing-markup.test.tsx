// Pins the landing chrome markup (nav, hero, sections, CTA, footer) so a move
// to shared components must render the same DOM and classes.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Clerk's buttons only add a click handler to their child.
vi.mock("@clerk/clerk-react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));

const { LandingPage } = await import("./LandingPage");
const { LandingReveal, LandingRevealItem } = await import("./LandingReveal");

function render(node: ReactNode): string {
  return renderToStaticMarkup(node).replace(
    /«r[0-9a-z]+»|_r_[0-9a-z]+_/gi,
    "«id»",
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("landing markup", () => {
  it("renders the landing page in dev", () => {
    vi.stubEnv("DEV", true);
    expect(render(<LandingPage />)).toMatchSnapshot();
  });

  it("renders the landing page in production", () => {
    vi.stubEnv("DEV", false);
    const html = render(<LandingPage />);
    expect(html).not.toContain("Continue without an account");
    expect(html).toMatchSnapshot();
  });

  it("renders reveal wrappers", () => {
    expect(
      render(
        <LandingReveal className="grid" delay={0.2}>
          <LandingRevealItem className="item">One</LandingRevealItem>
        </LandingReveal>,
      ),
    ).toMatchSnapshot();
  });
});

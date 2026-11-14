import { useClerk } from "@clerk/clerk-react";
import { IconVmem, ProductHero, ProductHeroOrbit } from "@vvedantb/ui";

export function LandingHero() {
  const clerk = useClerk();
  return (
    <ProductHero
      title="Memory your agents can actually use"
      tagline="Store context from chats and tools, connect it in a graph, and retrieve the slice that matters — with a Context Trace that shows why each memory matched."
      primaryCta={{ label: "Get started", onClick: () => clerk.openSignUp() }}
      visual={
        <ProductHeroOrbit>
          <IconVmem size={40} />
        </ProductHeroOrbit>
      }
    />
  );
}

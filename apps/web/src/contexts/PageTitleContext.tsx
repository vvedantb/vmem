import { createPageTitleContext } from "@vvedantb/ui";

const kit = createPageTitleContext();

export const { PageTitleProvider, usePageTitleSync } = kit;

// consumers see only the title pair, not the kit's mobile actions slot
export function usePageTitle() {
  const { pageTitle, setPageTitle } = kit.usePageTitle();
  return { pageTitle, setPageTitle };
}

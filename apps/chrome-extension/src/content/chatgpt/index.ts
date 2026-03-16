import { observeUrlChanges } from "@/content/shared/dom-utils";
import { removeExistingVmemButtons } from "@/content/shared/inject-button";
import { injectExportButton } from "./export-conversation";
import { injectUseVmemButton } from "./use-vmem";

function injectButtons(): void {
  removeExistingVmemButtons();
  injectExportButton();
  injectUseVmemButton();
}

injectButtons();

observeUrlChanges(() => {
  setTimeout(injectButtons, 1000);
});

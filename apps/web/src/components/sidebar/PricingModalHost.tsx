import { closePricingModal, usePricingModalOpen } from "@/lib/pricing-modal";
import { VProPricingModal } from "./VProPricingModal";

// Mount once. Opened through `openPricingModal` from anywhere in the app.
export function PricingModalHost() {
  return (
    <VProPricingModal
      open={usePricingModalOpen()}
      onClose={closePricingModal}
    />
  );
}

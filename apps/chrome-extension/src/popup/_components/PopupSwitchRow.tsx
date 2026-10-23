import type { ComponentProps } from "react";
import { LabeledSwitchRow } from "@vvedantb/ui";

// the 380px popup is always below sm, where the package row wraps the switch
// under the text; keep it on the right (the text column already shrinks)
export function PopupSwitchRow(props: ComponentProps<typeof LabeledSwitchRow>) {
  return <LabeledSwitchRow {...props} className="max-sm:flex-nowrap" />;
}

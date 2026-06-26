import { SlidePoll } from "../_components/SlidePoll";
import { POLL_STICKINESS } from "../_components/pollDefs";

export function SlidePollStickiness() {
  return <SlidePoll {...POLL_STICKINESS} kicker="Quick poll" />;
}

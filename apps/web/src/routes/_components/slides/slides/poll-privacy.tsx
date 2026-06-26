import { SlidePoll } from "../_components/SlidePoll";
import { POLL_PRIVACY } from "../_components/pollDefs";

export function SlidePollPrivacy() {
  return <SlidePoll {...POLL_PRIVACY} kicker="Quick poll" />;
}

/**
 * Empty black opener. Lets the presenter start on a blank screen and click
 * forward into slide 01, so the title's entrance animation plays live for
 * the audience instead of being already settled on load. The deck also
 * suppresses ambient orbs on this slide (id "00") for a pure-black hold.
 */
export function Slide00Black() {
  return <div className="h-full w-full" />;
}

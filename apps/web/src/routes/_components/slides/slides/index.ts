import type { ComponentType } from "react";
import { Slide01Title } from "./01-title";
import { Slide02Problem } from "./02-problem";
import { Slide03What } from "./03-what";
import { Slide04How } from "./04-how";
import { Slide05Graph } from "./05-graph";
import { Slide06Trace } from "./06-trace";
import { Slide07Capture } from "./07-capture";
import { Slide08Dream } from "./08-dream";
import { Slide09Safe } from "./09-safe";
import { Slide10Workspaces } from "./10-workspaces";
import { Slide11Comparison } from "./11-comparison";
import { Slide12Closing } from "./12-closing";

export interface SlideEntry {
  id: string;
  title: string;
  Component: ComponentType;
}

export const SLIDES: SlideEntry[] = [
  { id: "01", title: "Title", Component: Slide01Title },
  { id: "02", title: "The problem", Component: Slide02Problem },
  { id: "03", title: "What vmem is", Component: Slide03What },
  { id: "04", title: "How it works", Component: Slide04How },
  { id: "05", title: "Memory graph", Component: Slide05Graph },
  { id: "06", title: "Context Trace", Component: Slide06Trace },
  { id: "07", title: "Capture everywhere", Component: Slide07Capture },
  { id: "08", title: "Dream Mode", Component: Slide08Dream },
  { id: "09", title: "Safe by design", Component: Slide09Safe },
  { id: "10", title: "Workspaces & teams", Component: Slide10Workspaces },
  { id: "11", title: "vs the field", Component: Slide11Comparison },
  { id: "12", title: "Closing", Component: Slide12Closing },
];

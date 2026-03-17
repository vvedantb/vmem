import { Suspense } from "react";
import TimelineClient from "./TimelineClient";

export default function TimelinePage() {
  return (
    <Suspense>
      <TimelineClient />
    </Suspense>
  );
}

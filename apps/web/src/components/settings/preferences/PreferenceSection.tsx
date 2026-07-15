import type { ReactNode } from "react";
import { Card, CardContent } from "@vmem/ui";

export function PreferenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-medium text-foreground text-balance">
        {title}
      </h3>
      <Card className="shadow-none">
        <CardContent className="space-y-6 p-6">{children}</CardContent>
      </Card>
    </section>
  );
}

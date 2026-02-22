import { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  rightSection?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  title,
  rightSection,
  children,
}: PageContainerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex flex-shrink-0 flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl leading-tight font-instrumentSerif text-foreground">
          {title}
        </h2>
        {rightSection && <div className="flex-shrink-0">{rightSection}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <div className="space-y-8 pb-6">{children}</div>
      </div>
    </div>
  );
}

import { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  description: string;
  rightSection?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  title,
  description,
  rightSection,
  children,
}: PageContainerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-7 flex flex-shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl leading-tight font-instrumentSerif text-foreground md:text-4xl">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {rightSection && <div className="flex-shrink-0">{rightSection}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <div className="space-y-8 pb-6">{children}</div>
      </div>
    </div>
  );
}

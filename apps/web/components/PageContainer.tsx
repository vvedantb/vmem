import { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  title,
  centerSection,
  rightSection,
  children,
}: PageContainerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 md:relative">
          <h2 className="text-2xl leading-tight font-instrumentSerif text-foreground">
            {title}
          </h2>
          {centerSection && (
            <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
              {centerSection}
            </div>
          )}
          {rightSection && <div className="flex-shrink-0">{rightSection}</div>}
        </div>
        {centerSection && (
          <div className="mt-3 flex justify-center md:hidden">
            {centerSection}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <div className="space-y-8 pb-6">{children}</div>
      </div>
    </div>
  );
}

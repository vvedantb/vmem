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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-start justify-between gap-4 mb-8 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-instrumentSerif text-black dark:text-white">
            {title}
          </h2>
          {/* <p className="text-neutral-500 mt-2">{description}</p> */}
        </div>
        {rightSection && <div className="flex-shrink-0">{rightSection}</div>}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 -mr-4 pr-4">
        <div className="space-y-10 pb-4">{children}</div>
      </div>
    </div>
  );
}

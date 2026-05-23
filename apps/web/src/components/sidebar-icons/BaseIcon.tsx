import type { ReactNode } from "react";

export interface SidebarIconProps {
  className?: string;
  size?: number;
  stroke?: number;
}

export function BaseIcon({
  className,
  size = 18,
  stroke = 1.7,
  children,
}: SidebarIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `sb-icon-root ${className}` : "sb-icon-root"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

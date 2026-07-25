import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils/cn";

// breadcrumb, navigation trail for the current page location renders its children as a horizontal list with `/` separators automatically
// inserted between them designed to replace the page title + back button on
// detail pages: the parent route(s) act as the "up" affordance and the final
// segment identifies the current page example: <breadcrumb> <breadcrumblink aschild> <link to="/codebases">codebases</link> </breadcrumblink> <breadcrumbpage>acme, corp/api</breadcrumbpage> </breadcrumb>
const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => {
  // Filter out falsy children (e.g. conditionally rendered segments) so the
  // separator interleaving stays aligned with actual rendered items.
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <nav
      ref={ref}
      aria-label="breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-2xl font-instrumentSerif leading-tight",
        className,
      )}
      {...props}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item}
          {index < items.length - 1 && <BreadcrumbSeparator />}
        </React.Fragment>
      ))}
    </nav>
  );
});
Breadcrumb.displayName = "Breadcrumb";

// clickable breadcrumb segment (parent routes) muted by default, shifts to
// foreground on hover pass `aschild` to render as your router's link
// component while keeping the styling, preserves type, safe routing
const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }
>(({ asChild = false, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      ref={ref}
      className={cn(
        "min-w-0 truncate text-muted transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

// current page segment (last in the trail) same font weight as parent links
// but at foreground colour, and not clickable, signals "you are here"
const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    aria-current="page"
    className={cn("min-w-0 truncate text-foreground", className)}
    {...props}
  />
));
BreadcrumbPage.displayName = "BreadcrumbPage";

// separator rendered automatically between breadcrumb children
const BreadcrumbSeparator = () => (
  <span aria-hidden className="flex-shrink-0 text-muted/40">
    /
  </span>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

export { Breadcrumb, BreadcrumbLink, BreadcrumbPage };

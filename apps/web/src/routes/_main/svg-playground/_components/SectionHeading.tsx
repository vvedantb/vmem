/**
 * Heading + blurb pair shown above each animation grid.
 *
 * Kept in its own file so each section component stays focused on its
 * cards alone — six identical inline copies would just be noise.
 */
export function SectionHeading({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="text-sm text-muted">{blurb}</p>
    </div>
  );
}

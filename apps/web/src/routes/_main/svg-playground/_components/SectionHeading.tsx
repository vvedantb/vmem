// heading + blurb pair shown above each animation grid
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

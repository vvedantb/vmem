import { Card, CardContent, Skeleton } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";

export function PreferencesPageSkeleton() {
  return (
    <PageContainer title="Preferences" centeredMaxWidth showTitle>
      <div className="space-y-8">
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        {[1, 2, 3].map((section) => (
          <section key={section} className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Card className="shadow-none">
              <CardContent className="space-y-6 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}

import {
  SettingsPage as AppKitSettingsPage,
  type SettingsLayoutProps,
  type SettingsPageProps,
} from "@vvedantb/app-kit";
import PageContainer from "@/components/shell/PageContainer";

function layout({
  title,
  headerRight,
  toolbar,
  tabs,
  fillHeight,
  children,
}: SettingsLayoutProps) {
  return (
    <PageContainer
      title={title}
      centeredMaxWidth
      insetHeader
      showTitle
      rightSection={headerRight}
      toolbar={toolbar}
      tabs={tabs}
      noScroll={fillHeight}
    >
      {children}
    </PageContainer>
  );
}

/** App-kit settings chrome mapped onto the vmem `PageContainer`. */
export function SettingsPage(props: Omit<SettingsPageProps, "layout">) {
  return <AppKitSettingsPage {...props} layout={layout} />;
}

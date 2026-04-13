import { Suspense } from "react";
import FilesClient from "./_components/FilesClient";

export default function FilesPage() {
  return (
    <Suspense>
      <FilesClient />
    </Suspense>
  );
}

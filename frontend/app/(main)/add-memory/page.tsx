import AddMemoryForm from "@/components/AddMemoryForm";
import PageContainer from "@/components/PageContainer";

export default function AddMemoryPage() {
  return (
    <PageContainer
      title="Add Memory"
      description="Store a new memory in your vault"
    >
      <AddMemoryForm />
    </PageContainer>
  );
}

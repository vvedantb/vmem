import AddMemoryForm from "@/components/AddMemoryForm";

export default function AddMemoryPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Add Memory
        </h2>
        <p className="text-neutral-500 mt-2">
          Store a new memory in your vault
        </p>
      </div>

      <AddMemoryForm />
    </div>
  );
}

import SettingsToggles from "@/components/SettingsToggles";
import PageContainer from "@/components/PageContainer";

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Configure your vMemory experience"
    >
      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <h3 className="text-lg font-medium mb-2 text-black dark:text-white">
          Profile
        </h3>
        <div className="flex items-center gap-6 mt-6">
          <div className="w-16 h-16 rounded-full bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center">
            <span className="text-2xl font-medium text-neutral-600 dark:text-neutral-400">
              U
            </span>
          </div>
          <div>
            <p className="text-lg font-medium text-black dark:text-white">
              User
            </p>
            <p className="text-sm text-neutral-500">user@example.com</p>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
          Preferences
        </h3>
        <SettingsToggles />
      </div>

      <div className="p-8 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10">
        <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h3>
        <p className="text-sm text-neutral-500">
          Permanently delete your account and all associated data.
        </p>
        <button className="mt-6 px-5 py-2.5 rounded-xl border border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors">
          Delete Account
        </button>
      </div>
    </PageContainer>
  );
}

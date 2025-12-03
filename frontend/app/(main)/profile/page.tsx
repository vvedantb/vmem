export default function ProfilePage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Profile
        </h2>
        <p className="text-neutral-500 mt-2">
          Manage your account information
        </p>
      </div>

      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center">
            <span className="text-4xl font-medium text-neutral-600 dark:text-neutral-400">
              U
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-medium text-black dark:text-white">
              User
            </h3>
            <p className="text-neutral-500 mt-1">user@example.com</p>
            <p className="text-sm text-neutral-400 mt-2">
              Member since November 2025
            </p>
          </div>
          <button className="px-5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            Change Avatar
          </button>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
          Account Details
        </h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-2">
              Display Name
            </label>
            <input
              type="text"
              defaultValue="User"
              className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-2">
              Email Address
            </label>
            <input
              type="email"
              defaultValue="user@example.com"
              className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-2">
              Bio
            </label>
            <textarea
              rows={3}
              placeholder="Tell us about yourself..."
              className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all resize-none"
            />
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button className="px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors">
            Save Changes
          </button>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
          Usage Statistics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-neutral-500">Total Memories</p>
            <p className="text-2xl font-semibold text-black dark:text-white mt-1">128</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">API Requests</p>
            <p className="text-2xl font-semibold text-black dark:text-white mt-1">1,284</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Storage Used</p>
            <p className="text-2xl font-semibold text-black dark:text-white mt-1">24.5 MB</p>
          </div>
        </div>
      </div>
    </div>
  );
}


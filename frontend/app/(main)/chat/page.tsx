import { IconMessage } from "@tabler/icons-react";

export default function ChatPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Chat
        </h2>
        <p className="text-neutral-500 mt-2">
          Ask questions about your memories
        </p>
      </div>

      <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
        <div className="flex-1 p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] overflow-y-auto">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center mb-6">
              <IconMessage className="w-8 h-8 text-neutral-400" stroke={1.5} />
            </div>
            <h3 className="text-lg font-medium text-black dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="text-neutral-500 max-w-sm">
              Ask anything about your stored memories. The AI will search and
              reference relevant information.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Ask about your memories..."
              className="flex-1 px-5 py-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
            <button className="px-6 py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

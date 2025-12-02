"use client";

import { useState } from "react";

interface Memory {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
}

interface MemorySearchProps {
  memories: Memory[];
}

export default function MemorySearch({ memories }: MemorySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMemories = memories.filter(
    (memory) =>
      memory.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      memory.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories semantically..."
          className="w-full px-6 py-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-black/30 dark:focus:border-white/30 focus:bg-black/[0.04] dark:focus:bg-white/[0.04] transition-all"
        />
        <svg
          className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 dark:text-neutral-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Title
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                Tags
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredMemories.map((memory) => (
              <tr
                key={memory.id}
                className="border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-6 py-5">
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {memory.title}
                  </span>
                </td>
                <td className="px-6 py-5 hidden md:table-cell">
                  <div className="flex gap-2 flex-wrap">
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 text-xs rounded-full bg-black/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border border-black/10 dark:border-white/10"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className="text-sm text-neutral-500">
                    {memory.createdAt}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredMemories.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-neutral-500">No memories found</p>
          </div>
        )}
      </div>
    </>
  );
}

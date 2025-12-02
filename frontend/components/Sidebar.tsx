"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/memories", label: "Memories" },
  { href: "/add-memory", label: "Add Memory" },
  { href: "/api-keys", label: "API Keys" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="fixed top-6 left-6 z-50 md:hidden p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
        aria-label="Toggle menu"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {mobileMenuOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-white/80 dark:bg-black/80 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen bg-white dark:bg-black border-r border-black/10 dark:border-white/10 z-40
          w-[280px] md:w-[20%] md:max-w-[360px]
          transform transition-transform duration-300 ease-out
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
        `}
      >
        <div className="flex flex-col h-full px-4 py-8">
          <div className="mb-8 px-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
              vmem
            </h1>
          </div>

          <nav className="flex-1">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`
                      block w-full px-4 py-3 rounded-xl text-base font-medium
                      transition-all duration-200 ease-out
                      ${
                        isActive
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </ul>
          </nav>

          <div className="pt-8 border-t border-black/10 dark:border-white/10 space-y-4">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            >
              <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
              <div className="relative w-10 h-6 rounded-full bg-black/10 dark:bg-white/10">
                <span
                  className={`
                    absolute top-1 w-4 h-4 rounded-full transition-all
                    ${isDark ? "left-5 bg-white" : "left-1 bg-black"}
                  `}
                />
              </div>
            </button>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 px-4">
              © 2025 vMemory
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

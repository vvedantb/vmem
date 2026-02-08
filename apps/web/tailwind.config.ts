import { heroui } from "@heroui/react";
import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

/** @type {import('tailwindcss').Config} */

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./archived/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}",
    "../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-host-grotesk)", "system-ui", "sans-serif"],
        hostGrotesk: ["var(--font-host-grotesk)"],
        michroma: ["var(--font-michroma)"],
        instrumentSerif: ["var(--font-instrument-serif)"],
        instrumentSans: ["var(--font-instrument-sans)"],
      },
      screens: {
        xs: "475px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      keyframes: {
        aurora: {
          "0%": {
            backgroundPosition: "0% 50%",
            transform: "rotate(-5deg) scale(0.9)",
          },
          "25%": {
            backgroundPosition: "50% 100%",
            transform: "rotate(5deg) scale(1.1)",
          },
          "50%": {
            backgroundPosition: "100% 50%",
            transform: "rotate(-3deg) scale(0.95)",
          },
          "75%": {
            backgroundPosition: "50% 0%",
            transform: "rotate(3deg) scale(1.05)",
          },
          "100%": {
            backgroundPosition: "0% 50%",
            transform: "rotate(-5deg) scale(0.9)",
          },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        aurora: "aurora 8s ease-in-out infinite alternate",
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
      },
      backgroundImage: {
        "hero-section-title":
          "linear-gradient(91deg, #FFF 32.88%, rgba(255, 255, 255, 0.40) 99.12%)",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    heroui({
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            background: "#fafafa", // neutral-50
            foreground: "#0a0a0a", // neutral-950
            primary: {
              DEFAULT: "#404040", // neutral-700 (slightly darker for better contrast)
              foreground: "#fafafa", // neutral-50
            },
            secondary: {
              DEFAULT: "#f5f5f5", // neutral-100
              foreground: "#0a0a0a", // neutral-950
            },
            default: {
              DEFAULT: "#e5e5e5", // neutral-200
              foreground: "#404040", // neutral-700
            },
            success: {
              DEFAULT: "#16a34a", // green-600
              foreground: "#ffffff",
            },
            warning: {
              DEFAULT: "#ea580c", // orange-600
              foreground: "#ffffff",
            },
            danger: {
              DEFAULT: "#dc2626", // red-600
              foreground: "#ffffff",
            },
            content1: "#ffffff", // white
            content2: "#f5f5f5", // neutral-100
            content3: "#e5e5e5", // neutral-200
            content4: "#d4d4d4", // neutral-300
          },
        },
        dark: {
          colors: {
            background: "#0a0a0a", // neutral-950
            foreground: "#f5f5f5", // neutral-100
            primary: {
              DEFAULT: "#a3a3a3", // neutral-400 (lighter for better dark mode visibility)
              foreground: "#0a0a0a", // neutral-950
            },
            secondary: {
              DEFAULT: "#262626", // neutral-800
              foreground: "#f5f5f5", // neutral-100
            },
            default: {
              DEFAULT: "#404040", // neutral-700
              foreground: "#d4d4d4", // neutral-300
            },
            success: {
              DEFAULT: "#22c55e", // green-500 (slightly lighter for dark mode)
              foreground: "#000000",
            },
            warning: {
              DEFAULT: "#f97316", // orange-500 (slightly lighter for dark mode)
              foreground: "#000000",
            },
            danger: {
              DEFAULT: "#ef4444", // red-500 (slightly lighter for dark mode)
              foreground: "#000000",
            },
            content1: "#171717", // neutral-900
            content2: "#262626", // neutral-800
            content3: "#404040", // neutral-700
            content4: "#525252", // neutral-600
          },
        },
      },
    }),
  ],
};
export default config;

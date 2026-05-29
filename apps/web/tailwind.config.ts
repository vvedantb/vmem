import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

function v(name: string) {
  return `var(--${name})`;
}

const config: Config = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: v("border"),
        backdrop: v("backdrop"),
        background: v("background"),
        foreground: v("foreground"),
        accent: {
          DEFAULT: v("accent"),
          foreground: v("accent-foreground"),
        },
        danger: {
          DEFAULT: v("danger"),
          foreground: v("danger-foreground"),
          ring: v("danger-ring"),
          border: v("danger-border"),
        },
        default: {
          DEFAULT: v("default"),
          foreground: v("default-foreground"),
        },
        field: {
          background: v("field-background"),
          border: v("field-border"),
          foreground: v("field-foreground"),
          placeholder: v("field-placeholder"),
        },
        focus: {
          DEFAULT: v("focus"),
          ring: v("focus-ring"),
          border: v("focus-border"),
        },
        muted: v("muted"),
        overlay: {
          DEFAULT: v("overlay"),
          foreground: v("overlay-foreground"),
        },
        scrollbar: v("scrollbar"),
        segment: {
          DEFAULT: v("segment"),
          foreground: v("segment-foreground"),
        },
        separator: v("separator"),
        success: {
          DEFAULT: v("success"),
          foreground: v("success-foreground"),
        },
        surface: {
          DEFAULT: v("surface"),
          foreground: v("surface-foreground"),
          secondary: v("surface-secondary"),
          "secondary-foreground": v("surface-secondary-foreground"),
          tertiary: v("surface-tertiary"),
          "tertiary-foreground": v("surface-tertiary-foreground"),
          card: v("surface-card"),
        },
        warning: {
          DEFAULT: v("warning"),
          foreground: v("warning-foreground"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        field: "var(--field-radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        overlay: "var(--overlay-shadow)",
        soft: "0 1px 2px rgba(16, 24, 40, 0.06), 0 10px 28px rgba(16, 24, 40, 0.06)",
        panel:
          "0 1px 2px rgba(16, 24, 40, 0.05), 0 16px 44px rgba(16, 24, 40, 0.1)",
        insetSoft:
          "inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(16, 24, 40, 0.04)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      fontFamily: {
        sans: ["Instrument Sans", "system-ui", "sans-serif"],
        instrumentSerif: ["Instrument Serif", "Georgia", "serif"],
        instrumentSans: ["Instrument Sans", "system-ui", "sans-serif"],
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
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        aurora: "aurora 8s ease-in-out infinite alternate",
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
        indeterminate: "indeterminate 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;

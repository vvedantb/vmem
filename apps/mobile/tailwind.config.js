const hsl = (name) => `hsl(var(--${name}))`;

/** @type {import("tailwindcss").Config} */
module.exports = {
  // @vvedantb/native-ui reads the scheme through NativeWind; class mode lets
  // the app and the components switch together (native-ui README, Theme).
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./src/**/*.{js,ts,tsx}",
    "../../node_modules/@vvedantb/native-ui/src/**/*.{js,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Values live in global.css (light and dark), copied from the archived
      // vmem Expo app, which mirrors apps/web tokens.
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        primary: {
          DEFAULT: hsl("primary"),
          foreground: hsl("primary-foreground"),
        },
        secondary: {
          DEFAULT: hsl("secondary"),
          foreground: hsl("secondary-foreground"),
        },
        destructive: {
          DEFAULT: hsl("destructive"),
          foreground: hsl("destructive-foreground"),
        },
        danger: hsl("destructive"),
        success: hsl("success"),
        warning: hsl("warning"),
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: {
          DEFAULT: hsl("accent"),
          foreground: hsl("accent-foreground"),
        },
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },
        popover: {
          DEFAULT: hsl("overlay"),
          foreground: hsl("overlay-foreground"),
        },
        surface: {
          DEFAULT: hsl("surface"),
          secondary: hsl("surface-secondary"),
          tertiary: hsl("surface-tertiary"),
          card: hsl("card"),
        },
        "field-background": hsl("surface"),
        default: {
          DEFAULT: hsl("default"),
          foreground: hsl("default-foreground"),
        },
        separator: hsl("separator"),
      },
      fontFamily: {
        "instrument-sans": ["InstrumentSans_400Regular"],
        "instrument-sans-medium": ["InstrumentSans_500Medium"],
        "instrument-sans-semibold": ["InstrumentSans_600SemiBold"],
        "instrument-sans-bold": ["InstrumentSans_700Bold"],
      },
    },
  },
  plugins: [],
};

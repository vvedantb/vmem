import {
  configureTheme,
  palette,
  tokens,
  useScheme as useKitScheme,
  withAlpha,
} from "@vvedantb/native-ui/theme";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { vars } from "nativewind";

export type Scheme = "light" | "dark";

/**
 * The scheme every @vvedantb/native-ui component reads (NativeWind). It also
 * redraws after `configureTheme`, so a Dark to Neutral pick repaints.
 */
export function useScheme(): Scheme {
  return useKitScheme();
}

/** Navigator colours from the native-ui tokens, so screens and cards match. */
export function navigationTheme(scheme: Scheme): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: tokens.color.background[scheme],
      card: tokens.color.surface[scheme],
      text: tokens.color.foreground[scheme],
      border: tokens.color.border[scheme],
    },
  };
}

/** Text colours for app copy (native-ui README: colours as styles, not classes). */
export function textColor(
  scheme: Scheme,
  tone: "foreground" | "muted" = "foreground",
) {
  return { color: tokens.color[tone][scheme] };
}

/** The kit dark-slot values that Neutral changes. */
type DarkFamily = {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  separator: string;
  surface: string;
  surfaceSecondary: string;
  surfaceCard: string;
  fill: string;
  default: string;
  overlay: string;
  segment: string;
  surfaceTertiary: string;
  fieldPlaceholder: string;
  tabBarPill: string;
};

/** The package dark values, kept before a Neutral pick overwrites them. */
const DARK: DarkFamily = {
  background: tokens.color.background.dark,
  foreground: tokens.color.foreground.dark,
  muted: tokens.color.muted.dark,
  border: tokens.color.border.dark,
  separator: tokens.color.separator.dark,
  surface: tokens.color.surface.dark,
  surfaceSecondary: tokens.color.surfaceSecondary.dark,
  surfaceCard: tokens.color.surfaceCard.dark,
  fill: tokens.color.fill.dark,
  default: palette.default.dark,
  overlay: palette.overlay.dark,
  segment: palette.segment.dark,
  surfaceTertiary: palette.surfaceTertiary.dark,
  fieldPlaceholder: palette.fieldPlaceholder.dark,
  tabBarPill: palette.tabBarPill.dark,
};

/** The web Neutral theme: `@vvedantb/ui` tokens.css `.dark.neutral`, as hex. */
const NEUTRAL: DarkFamily = {
  background: "#222325",
  foreground: "#fafafa",
  muted: "#9fa0a2",
  border: "#4e4f52",
  separator: "#3a3b3e",
  surface: "#303134",
  surfaceSecondary: "#3a3b3e",
  surfaceCard: "#303134",
  // The package glass is its dark surface at 88%; Neutral's surface the same.
  fill: withAlpha("#303134", 0.88),
  default: "#444548",
  overlay: "#303134",
  segment: "#444548",
  surfaceTertiary: "#444548",
  fieldPlaceholder: "#9fa0a2",
  tabBarPill: "#444548",
};

type Pair = { light: string; dark: string };

const withDark = (pair: Pair, dark: string): Pair => ({
  light: pair.light,
  dark,
});

/**
 * Puts Dark or Neutral in the kit's dark slot. Light is not changed. The
 * kit parts redraw at once (`configureTheme`).
 */
export function applyDarkFamily(family: "dark" | "neutral") {
  const next = family === "neutral" ? NEUTRAL : DARK;
  const color = tokens.color;
  configureTheme({
    color: {
      background: withDark(color.background, next.background),
      foreground: withDark(color.foreground, next.foreground),
      muted: withDark(color.muted, next.muted),
      border: withDark(color.border, next.border),
      separator: withDark(color.separator, next.separator),
      surface: withDark(color.surface, next.surface),
      surfaceSecondary: withDark(color.surfaceSecondary, next.surfaceSecondary),
      surfaceCard: withDark(color.surfaceCard, next.surfaceCard),
      fill: withDark(color.fill, next.fill),
    },
    palette: {
      default: withDark(palette.default, next.default),
      overlay: withDark(palette.overlay, next.overlay),
      segment: withDark(palette.segment, next.segment),
      surfaceTertiary: withDark(palette.surfaceTertiary, next.surfaceTertiary),
      fieldPlaceholder: withDark(
        palette.fieldPlaceholder,
        next.fieldPlaceholder,
      ),
      tabBarPill: withDark(palette.tabBarPill, next.tabBarPill),
    },
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

/** `#rrggbb` as the `h s% l%` channels global.css holds, to one decimal. */
function hslChannels(hex: string): string {
  const channel = (at: number) => parseInt(hex.slice(at, at + 2), 16) / 255;
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h =
    d === 0
      ? 0
      : max === r
        ? ((g - b) / d + 6) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return `${String(round(h * 60))} ${String(round(s * 100))}% ${String(round(l * 100))}%`;
}

/**
 * The global.css `.dark` variables that Neutral changes. The root layout sets
 * them on a view over the app (NativeWind `vars`), so class colours follow a
 * Neutral pick at once.
 */
export const NEUTRAL_CLASS_VARS = vars(
  Object.fromEntries(
    Object.entries({
      background: NEUTRAL.background,
      foreground: NEUTRAL.foreground,
      card: NEUTRAL.surfaceCard,
      "surface-card": NEUTRAL.surfaceCard,
      surface: NEUTRAL.surface,
      field: NEUTRAL.surface,
      popover: NEUTRAL.overlay,
      overlay: NEUTRAL.overlay,
      secondary: NEUTRAL.default,
      default: NEUTRAL.default,
      segment: NEUTRAL.segment,
      "surface-tertiary": NEUTRAL.surfaceTertiary,
      muted: NEUTRAL.surfaceSecondary,
      "surface-secondary": NEUTRAL.surfaceSecondary,
      "muted-foreground": NEUTRAL.muted,
      border: NEUTRAL.border,
      input: NEUTRAL.border,
      separator: NEUTRAL.separator,
    }).map(([name, hex]) => [`--${name}`, hslChannels(hex)]),
  ),
);

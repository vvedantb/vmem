import { useMemo } from "react";
import { StyleSheet } from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import { useColorScheme } from "nativewind";
import { THEME_COLORS } from "@/lib/theme";

/**
 * Markdown renderer for assistant messages — mobile stand-in for web's
 * Streamdown-based MessageResponse, styled with the shared theme tokens.
 */
export default function MarkdownResponse({ text }: { text: string }) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          color: theme.foreground,
          fontSize: 16,
          lineHeight: 24,
          fontFamily: "InstrumentSans_400Regular",
        },
        heading1: { fontFamily: "InstrumentSans_600SemiBold", marginTop: 12 },
        heading2: { fontFamily: "InstrumentSans_600SemiBold", marginTop: 10 },
        heading3: { fontFamily: "InstrumentSans_600SemiBold", marginTop: 8 },
        strong: { fontFamily: "InstrumentSans_600SemiBold" },
        link: { color: theme.foreground, textDecorationLine: "underline" },
        code_inline: {
          backgroundColor: theme.surfaceSecondary,
          color: theme.foreground,
          borderRadius: 4,
          paddingHorizontal: 4,
          fontFamily: "monospace",
          fontSize: 14,
        },
        code_block: {
          backgroundColor: theme.surfaceSecondary,
          color: theme.foreground,
          borderRadius: 8,
          borderWidth: 0,
          padding: 12,
          fontFamily: "monospace",
          fontSize: 13,
        },
        fence: {
          backgroundColor: theme.surfaceSecondary,
          color: theme.foreground,
          borderRadius: 8,
          borderWidth: 0,
          padding: 12,
          fontFamily: "monospace",
          fontSize: 13,
        },
        blockquote: {
          backgroundColor: "transparent",
          borderLeftWidth: 2,
          borderLeftColor: theme.separator,
          paddingLeft: 12,
          marginLeft: 0,
        },
        hr: { backgroundColor: theme.separator, height: 1 },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
        table: {
          borderWidth: 1,
          borderColor: theme.separator,
          borderRadius: 8,
        },
        th: { padding: 6 },
        td: { padding: 6 },
      }),
    [theme],
  );

  return <Markdown style={styles}>{text}</Markdown>;
}

import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

/**
 * shadow-plugin ships Tailwind v4 `@utility` / `@theme` CSS. Web is still on
 * Tailwind v3, so rewrite those at-rules into plain classes and `:root` before
 * Tailwind runs. Chrome-extension (v4) imports the package as-is.
 */
function tw4Utilities() {
  return {
    postcssPlugin: "postcss-tw4-utilities",
    Once(root) {
      root.walkAtRules("theme", (atRule) => {
        const rule = postcss.rule({ selector: ":root" });
        atRule.nodes?.forEach((node) => {
          rule.append(node.clone());
        });
        atRule.replaceWith(rule);
      });
      root.walkAtRules("utility", (atRule) => {
        const name = atRule.params.trim();
        if (name.includes("*")) {
          atRule.remove();
          return;
        }
        const rule = postcss.rule({ selector: `.${name}` });
        atRule.nodes?.forEach((node) => {
          rule.append(node.clone());
        });
        atRule.replaceWith(rule);
      });
    },
  };
}
tw4Utilities.postcss = true;

export default {
  plugins: [tw4Utilities, tailwindcss, autoprefixer],
};

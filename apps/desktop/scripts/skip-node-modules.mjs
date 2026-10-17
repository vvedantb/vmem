/**
 * electron-builder `beforeBuild` hook. Returning false tells it that
 * node_modules is handled outside: scripts/build.mjs bundles every JS
 * dependency into dist/main.js, so none are copied from the pnpm tree.
 */
export default function skipNodeModules() {
  return false;
}

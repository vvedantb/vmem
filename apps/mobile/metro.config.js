const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { defineExpoMetroConfig } = require("@vvedantb/config");

// The workspace uses pnpm's hoisted linker. The root node_modules keeps the
// web app's React; this app pins the Expo SDK React in its own node_modules.
// `singletons` resolves react/react-dom from this app's folder, wherever the
// import comes from, so two Reacts never break hooks.
// Absolute paths: tools such as knip load this file from the repository root.
module.exports = defineExpoMetroConfig({
  projectRoot: __dirname,
  getDefaultConfig,
  withNativeWind,
  input: path.join(__dirname, "global.css"),
  inlineRem: 16,
  nativeWindConfig: path.join(__dirname, "tailwind.config.js"),
  singletons: ["react", "react-dom"],
});

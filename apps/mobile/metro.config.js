const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// The workspace uses pnpm's hoisted linker. The root node_modules keeps the
// web app's React; this app pins the Expo SDK React in its own node_modules.
// A package at the root (Clerk, expo-router, native-ui) would find the root
// copy first, and two Reacts break hooks. Resolve these singletons from this
// app's folder, wherever the import comes from.
const SINGLETONS = new Set(["react", "react-dom"]);
const appOrigin = path.join(projectRoot, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName.split("/")[0];
  if (name !== undefined && SINGLETONS.has(name)) {
    return context.resolveRequest(
      { ...context, originModulePath: appOrigin },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Absolute paths: tools such as knip load this file from the repository root.
module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
  configPath: path.join(projectRoot, "tailwind.config.js"),
  inlineRem: 16,
});

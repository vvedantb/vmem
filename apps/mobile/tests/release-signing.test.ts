import assert from "node:assert/strict";
import { describe, it } from "node:test";
import withReleaseSigning from "../plugins/withReleaseSigning.js";

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";
const BASE_CONFIG = { name: "vmem", slug: "vmem" };

async function applyToGradle(contents: string): Promise<string> {
  const config = withReleaseSigning({ ...BASE_CONFIG });
  const mod = config.mods?.android?.appBuildGradle;
  assert.ok(mod, "plugin registers an appBuildGradle mod");
  const result = await mod({
    ...BASE_CONFIG,
    modRawConfig: BASE_CONFIG,
    modResults: { path: "app/build.gradle", language: "groovy", contents },
    modRequest: {
      projectRoot: "/project",
      platformProjectRoot: "/project/android",
      modName: "appBuildGradle",
      platform: "android",
      introspect: false,
    },
  });
  return result.modResults.contents;
}

describe("withReleaseSigning", () => {
  it("leaves Groovy interpolation for Gradle, not JavaScript", async () => {
    const gradle = await applyToGradle("android {}\n");
    assert.ok(gradle.includes(MARKER));
    assert.ok(gradle.includes('${releaseSigningMissing.join(", ")}'));
  });

  it("keeps the masked substring out of Groovy identifiers", async () => {
    const gradle = await applyToGradle("android {}\n");
    const lines = gradle.split("\n").filter((line) => line !== MARKER);
    assert.ok(lines.every((line) => !line.includes("vmem")));
  });

  it("appends the block only once", async () => {
    const once = await applyToGradle("android {}\n");
    assert.equal(await applyToGradle(once), once);
  });
});

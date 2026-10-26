/**
 * Generates the desktop app and tray icons into assets/. Run it with
 * `pnpm --filter @vmem/desktop icons` and commit the output: CI does not run
 * it, and macOS `iconutil` is not needed because the ICNS and ICO containers
 * are written here.
 *
 * - App icons come from apps/web/public/icon.png (white mark on black, 512 px).
 * - Tray icons are drawn from the shared `@vvedantb/ui/brand` vmem mark so they stay sharp at 16 px.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "../web/public/icon.png");
const out = join(root, "assets");

// Node cannot load the TypeScript sources in node_modules, so bundle the shared brand helper first.
const brand = await build({
  stdin: {
    contents: 'export { appMarkSvg, appTileSvg } from "@vvedantb/ui/brand";',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
});
const { appMarkSvg, appTileSvg } = await import(
  `data:text/javascript;base64,${Buffer.from(brand.outputFiles[0].text).toString("base64")}`
);

/**
 * The shared vmem mark as a square SVG of `size` px. With `tile` it is the
 * black family tile with a white glyph. Without it, the glyph is black on
 * transparent and the tight view box keeps a 16 px menu bar icon legible.
 */
function markSvg(size, tile) {
  const svg = tile ? appTileSvg("vmem") : appMarkSvg("vmem", "#000");
  return Buffer.from(
    svg.replace("<svg ", `<svg width="${size}" height="${size}" `),
  );
}

const png = (buffer) => sharp(buffer).png().toBuffer();
const appIcon = (size) =>
  sharp(source).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

/** macOS icons are not masked by the OS, so round the corners here. */
async function roundedAppIcon(size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2237}"/></svg>`,
  );
  return sharp(await appIcon(size))
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** ICO with PNG-compressed images (Windows Vista and later). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/** ICNS with PNG chunks. Types follow Apple's icon family table. */
function buildIcns(chunks) {
  const body = chunks.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const total = 8 + body.reduce((sum, b) => sum + b.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...body]);
}

await mkdir(out, { recursive: true });

await writeFile(join(out, "icon.png"), await appIcon(512));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await writeFile(
  join(out, "icon.ico"),
  buildIco(
    await Promise.all(
      icoSizes.map(async (size) => ({ size, data: await appIcon(size) })),
    ),
  ),
);

const icnsTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];
await writeFile(
  join(out, "icon.icns"),
  buildIcns(
    await Promise.all(
      icnsTypes.map(async ([type, size]) => ({
        type,
        data: await roundedAppIcon(size),
      })),
    ),
  ),
);

// Windows and Linux tray: white mark on a black tile, readable on light and dark bars.
await writeFile(join(out, "tray.png"), await png(markSvg(16, true)));
await writeFile(join(out, "tray@2x.png"), await png(markSvg(32, true)));
// macOS menu bar: black on transparent. The `Template` suffix and
// setTemplateImage(true) let macOS recolour it for light and dark bars.
await writeFile(join(out, "trayTemplate.png"), await png(markSvg(16, false)));
await writeFile(
  join(out, "trayTemplate@2x.png"),
  await png(markSvg(32, false)),
);
